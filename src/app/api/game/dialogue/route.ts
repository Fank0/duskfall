import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  getSnapshot,
  saveChatMessage,
  applyInventoryChanges,
  adjustGold,
  upsertNpc,
} from "@/lib/game/state";
import { chatComplete } from "@/lib/game/llm";

export const dynamic = "force-dynamic";

// Deterministic merchant catalogue (one per room session — selected once and
// persisted as the NPC's "notes" field so the same merchant always sells the
// same items until restocked). Prices are balanced for low-level parties.
interface MerchantItem {
  name: string;
  type: string;
  price: number;
  description: string;
}

const CATALOGUE: MerchantItem[] = [
  { name: "Зелье лечения", type: "potion", price: 25, description: "Восстанавливает 2d4+2 HP при употреблении." },
  { name: "Зелье силы", type: "potion", price: 35, description: "+1d4 к атакам и урону на 1 минуту." },
  { name: "Факел", type: "misc", price: 1, description: "Освещает 20 футов в течение 1 часа." },
  { name: "Верёвка пеньковая (50 фт)", type: "misc", price: 5, description: "Прочная верёвка для самых разных нужд." },
  { name: "Кремень и огниво", type: "misc", price: 2, description: "Для разведения огня." },
  { name: "Священный символ", type: "misc", price: 15, description: "Символ веры, необходимый жрецу." },
  { name: "Свиток «Огненная стрела»", type: "scroll", price: 40, description: "Расходуемый свиток: 3d6 урона огнём по одной цели." },
  { name: "Свиток «Лечение»", type: "scroll", price: 30, description: "Расходуемый свиток: восстанавливает 2d4+2 HP." },
  { name: "Кинжал", type: "weapon", price: 12, description: "Лёгкое оружие 1d4. Можно метать." },
  { name: "Кожаный доспех", type: "armor", price: 30, description: "+1 к AC (легкая броня)." },
  { name: "Дротик (x5)", type: "weapon", price: 8, description: "Метательное оружие 1d4, комплект из 5 шт." },
  { name: "Связка ключей", type: "key", price: 20, description: "Набор отмычек и ключей. +1 к проверкам взлома." },
];

function pickMerchantStock(): MerchantItem[] {
  // Pick 5 random items from the catalogue.
  const shuffled = [...CATALOGUE].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 5);
}

function parseStock(notes: string): MerchantItem[] {
  // The stock is persisted as JSON inside the NPC's notes field.
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes);
    if (Array.isArray(parsed)) return parsed as MerchantItem[];
  } catch {
    /* ignore */
  }
  return [];
}

function serializeStock(stock: MerchantItem[]): string {
  return JSON.stringify(stock);
}

const SYSTEM_PROMPT_DIALOGUE = `Ты играешь роль NPC (неигрового персонажа) в D&D 5e-приключении. Отвечай В ХАРАКТЕРЕ этого NPC, на русском языке, тёмное фэнтези-стиль. 2-4 коротких предложения, без markdown, без эмодзи. Не описывай действия игрока, только речь и реакции NPC. Если NPC враждебен — коротко и грубо. Если дружелюбен — приветливо. Не упоминай, что ты ИИ.`;

/** POST /api/game/dialogue
 * Body: { roomCode, playerName, npcName, action, item? }
 * action: "intro" | "about" | "business" | "leave" | "buy" | "sell" */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const roomCode = (body?.roomCode ?? "").toString().toUpperCase().trim();
    const playerName = (body?.playerName ?? "").toString().trim();
    const npcName = (body?.npcName ?? "").toString().trim();
    const action = (body?.action ?? "intro").toString().trim();
    const itemName = (body?.item ?? "").toString().trim();
    if (!roomCode || !playerName || !npcName) {
      return NextResponse.json(
        { ok: false, error: "Укажите комнату, героя и NPC." },
        { status: 400 }
      );
    }
    const room = await db.room.findUnique({ where: { code: roomCode } });
    if (!room) return NextResponse.json({ ok: false, error: "Комната не найдена." }, { status: 404 });
    const player = await db.player.findFirst({ where: { name: playerName, roomId: room.id } });
    if (!player) return NextResponse.json({ ok: false, error: "Герой не найден." }, { status: 404 });
    if (!player.isAlive || player.hp <= 0) {
      return NextResponse.json({ ok: false, error: "Павший герой не может говорить." }, { status: 400 });
    }
    let npc = await db.npc.findFirst({ where: { roomId: room.id, name: npcName, isAlive: true } });
    if (!npc) {
      // Auto-create the NPC if it doesn't exist (best-effort: neutral ally).
      const created = await upsertNpc(room.id, npcName, "ally", "neutral", "В локации", "");
      if (!created) {
        return NextResponse.json({ ok: false, error: "NPC не найден." }, { status: 404 });
      }
      npc = await db.npc.findFirst({ where: { roomId: room.id, name: npcName } });
      if (!npc) return NextResponse.json({ ok: false, error: "NPC не найден." }, { status: 404 });
    }

    const round = room.round;
    let narrative = "";
    let tradeOutcome: { kind: "buy" | "sell"; item?: string; goldChange?: number; success?: boolean; reason?: string } | null = null;
    let stock: MerchantItem[] = [];

    // ===== TRADE ACTIONS (deterministic, no LLM) =====
    if (action === "business" || action === "buy" || action === "sell") {
      // Lazily generate + persist merchant stock.
      if (npc.role === "merchant") {
        stock = parseStock(npc.notes);
        if (stock.length === 0) {
          stock = pickMerchantStock();
          await db.npc.update({ where: { id: npc.id }, data: { notes: serializeStock(stock) } });
        }
      } else {
        // Non-merchant NPCs don't trade — return a flavour message instead.
        narrative = await runLlmDialogue(npc, player, "business_unavailable", "");
        await saveChatMessage(room.id, "dm", "", `${npcName} не торгует: ${narrative}`, round);
        const snapshot = await getSnapshot(roomCode);
        return NextResponse.json({ ok: true, snapshot, narrative, stock: [], tradeOutcome: null });
      }
    }

    if (action === "buy") {
      const item = stock.find((s) => s.name === itemName);
      if (!item) {
        tradeOutcome = { kind: "buy", item: itemName, success: false, reason: "Этого товара нет у продавца." };
        narrative = `${npcName} качает головой: «Такого у меня нет.»`;
      } else if (player.gold < item.price) {
        tradeOutcome = { kind: "buy", item: item.name, success: false, reason: "Недостаточно золота." };
        narrative = `${npcName} усмехается: «Приходи с золотом, тогда и поговорим.»`;
      } else {
        // Apply the trade.
        await adjustGold(room.id, playerName, -item.price);
        await applyInventoryChanges(room.id, playerName, [
          { action: "add", item: item.name, type: item.type, description: item.description },
        ]);
        tradeOutcome = { kind: "buy", item: item.name, goldChange: -item.price, success: true };
        narrative = await runLlmDialogue(npc, player, "buy", item.name);
      }
      await saveChatMessage(room.id, "dm", "", `${npcName}: ${narrative}`, round);
      const snapshot = await getSnapshot(roomCode);
      return NextResponse.json({ ok: true, snapshot, narrative, stock, tradeOutcome });
    }

    if (action === "sell") {
      // Player sells one of their inventory items at half-price.
      const invItem = await db.inventoryItem.findFirst({
        where: { roomId: room.id, playerName, itemName },
      });
      if (!invItem) {
        tradeOutcome = { kind: "sell", item: itemName, success: false, reason: "Этого предмета нет в инвентаре." };
        narrative = `У вас нет «${itemName}».`;
      } else {
        // Estimate price: use a flat 5 gold default, or look up the catalogue.
        const known = CATALOGUE.find((c) => c.name === itemName);
        const fullPrice = known ? known.price : 5;
        const sellPrice = Math.max(1, Math.floor(fullPrice / 2));
        await applyInventoryChanges(room.id, playerName, [
          { action: "remove", item: invItem.itemName, type: invItem.itemType },
        ]);
        await adjustGold(room.id, playerName, sellPrice);
        tradeOutcome = { kind: "sell", item: invItem.itemName, goldChange: sellPrice, success: true };
        narrative = `${npcName} бросает «${invItem.itemName}» на весы и кивает: «Беру за ${sellPrice} золота.»`;
      }
      await saveChatMessage(room.id, "dm", "", `${npcName}: ${narrative}`, round);
      const snapshot = await getSnapshot(roomCode);
      return NextResponse.json({ ok: true, snapshot, narrative, stock, tradeOutcome });
    }

    // ===== CONVERSATION ACTIONS (LLM in-character) =====
    if (action === "business") {
      // List merchant wares (deterministic).
      narrative = `${npcName} раскладывает товары: ${stock.map((s) => `${s.name} (${s.price} зм)`).join(", ")}.`;
      await saveChatMessage(room.id, "dm", "", `${npcName}: ${narrative}`, round);
      const snapshot = await getSnapshot(roomCode);
      return NextResponse.json({ ok: true, snapshot, narrative, stock, tradeOutcome: null });
    }

    // intro / about / leave — call the LLM in-character.
    narrative = await runLlmDialogue(npc, player, action, "");
    await saveChatMessage(room.id, "dm", "", `${npcName}: ${narrative}`, round);

    if (action === "leave") {
      // Player-initiated end-of-conversation system note.
      await saveChatMessage(room.id, "system", "", `${playerName} прощается с ${npcName}.`, round);
    }

    const snapshot = await getSnapshot(roomCode);
    return NextResponse.json({ ok: true, snapshot, narrative, stock: action === "business" ? stock : [], tradeOutcome });
  } catch (e: any) {
    console.error("[api/game/dialogue] error:", e);
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Ошибка диалога." },
      { status: 500 }
    );
  }
}

/** Call the LLM in-character as the NPC. Returns a Russian in-character line. */
async function runLlmDialogue(
  npc: { name: string; role: string; disposition: string; notes: string; location: string },
  player: { name: string; charClass: string; raceName: string; level: number; gold: number },
  action: string,
  itemName: string
): Promise<string> {
  const dispositionRu =
    npc.disposition === "friendly" ? "дружелюбный" :
    npc.disposition === "hostile" ? "враждебный" : "нейтральный";
  const roleRu =
    npc.role === "merchant" ? "торговец" :
    npc.role === "questgiver" ? "квестодатель" :
    npc.role === "ally" ? "союзник" : "враг";
  const sysMsg = `${SYSTEM_PROMPT_DIALOGUE}

Ты играешь: ${npc.name}, ${roleRu}, ${dispositionRu}${npc.location ? `, находится: ${npc.location}` : ""}.

Игрок: ${player.name} (${player.raceName} ${player.charClass}, ур.${player.level}, ${player.gold} золота).`;

  let userMsg = "";
  switch (action) {
    case "intro":
      userMsg = `Игрок только что подошёл к тебе и хочет поговорить. Поприветствуй его в характере твоей роли. 2-3 предложения.`;
      break;
    case "about":
      userMsg = `Игрок спрашивает: «Расскажи о себе». Ответь в характере. 3-4 предложения, упомяни кто ты и чем занимаешься.`;
      break;
    case "business_unavailable":
      userMsg = `Игрок хочет поторговать, но ты не торговец. Вежливо (или нет — по характеру) откажи. 1-2 предложения.`;
      break;
    case "buy":
      userMsg = `Игрок только что купил у тебя «${itemName}». Поблагодари за покупку в характере. 1-2 предложения.`;
      break;
    case "leave":
      userMsg = `Игрок прощается с тобой. Попрощайся в характере. 1-2 предложения.`;
      break;
    default:
      userMsg = `Ответь игроку в характере. 2-3 предложения.`;
  }
  try {
    const text = await chatComplete([
      { role: "system", content: sysMsg },
      { role: "user", content: userMsg },
    ]);
    if (text && text.trim().length > 10) return text.trim();
  } catch (e) {
    console.error("[dialogue] LLM error:", e);
  }
  // Fallback lines per action.
  switch (action) {
    case "intro":
      return `${npc.name} поднимает взгляд: «Что тебе нужно?»`;
    case "about":
      return `${npc.name} пожимает плечами: «Я — ${roleRu}, и живу здесь. Больше тебе знать ни к чему.»`;
    case "business_unavailable":
      return `${npc.name} качает головой: «Я не торгую. Ищи другого.»`;
    case "buy":
      return `${npc.name} кивает: «Дело. Заходи ещё.»`;
    case "leave":
      return `${npc.name} машет рукой: «Ступай.»`;
    default:
      return `${npc.name} молчит.`;
  }
}

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
import { validatePlayerName, validateRoomCode, validateShortString, sanitizeString, LIMITS } from "@/lib/game/validate";
import { sanitizeLLMOutput } from "@/lib/game/sanitize";
import { rateLimit, rateLimitedResponse, getClientIp } from "@/lib/game/rate-limit";
// B6: NPC daily schedule helpers.
import {
  getNpcActiveSchedule,
  isNpcUnavailableForDialogue,
} from "@/lib/game/npc-schedule";

export const dynamic = "force-dynamic";

// 30 dialogue actions per 10 minutes per IP (audit-v2: each action may call the LLM).
const dialogueLimiter = rateLimit({ windowMs: 10 * 60_000, max: 30, label: "dialogue" });

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

const SYSTEM_PROMPT_DIALOGUE = `Ты играешь роль NPC (неигрового персонажа) в d20 fantasy RPG-приключении. Отвечай В ХАРАКТЕРЕ этого NPC, на русском языке, тёмное фэнтези-стиль. 2-4 коротких предложения, без markdown, без эмодзи. Не описывай действия игрока, только речь и реакции NPC. Если NPC враждебен — коротко и грубо. Если дружелюбен — приветливо. Не упоминай, что ты ИИ.`;

/** POST /api/game/dialogue
 * Body: { roomCode, playerName, npcName, action, item? }
 * action: "intro" | "about" | "business" | "leave" | "buy" | "sell" */
export async function POST(req: NextRequest) {
  try {
    // ===== Rate limit (audit-v2): 30 / 10 min / IP. =====
    const ip = getClientIp(req);
    const rl = dialogueLimiter.check(`dialogue:${ip}`);
    if (!rl.ok) {
      return rateLimitedResponse("dialogue", rl.retryAfterMs) as unknown as NextResponse;
    }

    const body = await req.json().catch(() => ({}));
    const roomCodeRaw = (body?.roomCode ?? "").toString();
    const playerNameRaw = (body?.playerName ?? "").toString();
    const npcNameRaw = (body?.npcName ?? "").toString();
    const actionRaw = (body?.action ?? "intro").toString().trim();
    const itemNameRaw = (body?.item ?? "").toString();

    // ===== Validation (item 26) =====
    const roomCodeError = validateRoomCode(roomCodeRaw);
    if (roomCodeError) return NextResponse.json({ ok: false, error: roomCodeError }, { status: 400 });
    const playerNameError = validatePlayerName(playerNameRaw);
    if (playerNameError) return NextResponse.json({ ok: false, error: playerNameError }, { status: 400 });
    const npcNameError = validateShortString(npcNameRaw, "Имя NPC");
    if (npcNameError) return NextResponse.json({ ok: false, error: npcNameError }, { status: 400 });

    const roomCode = roomCodeRaw.toUpperCase().trim();
    const playerName = playerNameRaw.trim().replace(/\s+/g, " ").slice(0, LIMITS.PLAYER_NAME_MAX);
    const npcName = sanitizeString(npcNameRaw).slice(0, LIMITS.SHORT_STRING_MAX);
    const action = actionRaw.slice(0, 30);
    const itemName = sanitizeString(itemNameRaw).slice(0, LIMITS.SHORT_STRING_MAX);

    const validActions = ["intro", "about", "business", "leave", "buy", "sell"];
    if (!validActions.includes(action)) {
      return NextResponse.json({ ok: false, error: "Недопустимое действие диалога." }, { status: 400 });
    }
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

    // ===== B6: NPC daily schedule — block dialogue with sleeping/busy NPCs =====
    // Parse the NPC's schedule JSON once and check whether they're available
    // for dialogue at the current time-of-day. If unavailable, write a system
    // chat message ("💤 X сейчас спит. Вернитесь утром.") and return early.
    // The auto-created branch above is exempt — a freshly-created NPC has no
    // schedule, so the check is a no-op for them.
    const round = room.round;
    let npcSchedule: import("@/lib/game/types").NpcScheduleEntry[] = [];
    if (typeof npc.schedule === "string" && npc.schedule.trim().length > 0) {
      try {
        const parsed = JSON.parse(npc.schedule);
        if (Array.isArray(parsed)) npcSchedule = parsed;
      } catch { /* ignore */ }
    }
    const timeOfDay = (room.timeOfDay || "day") as "dawn" | "day" | "dusk" | "night";
    if (npcSchedule.length > 0) {
      // `isNpcUnavailableForDialogue` only reads `name` + `schedule`, but we
      // construct a full NpcState-like object for clarity and to keep the
      // object literal self-documenting.
      const npcState: import("@/lib/game/types").NpcState = {
        id: npc.id,
        name: npc.name,
        role: npc.role as any,
        disposition: npc.disposition as any,
        isAlive: Boolean(npc.isAlive),
        location: npc.location ?? "",
        notes: npc.notes ?? "",
        loyalty: npc.loyalty ?? 50,
        schedule: npcSchedule,
      };
      const unavail = isNpcUnavailableForDialogue(npcState, timeOfDay);
      if (unavail.unavailable && unavail.reason) {
        await saveChatMessage(room.id, "system", "", unavail.reason, round);
        const snapshot = await getSnapshot(roomCode);
        // Return the reason as `narrative` so the dialogue panel shows it
        // inline AND as `error` so the toast can surface it too.
        return NextResponse.json({
          ok: true,
          snapshot,
          narrative: unavail.reason,
          stock: [],
          tradeOutcome: null,
        });
      }
    }
    // Active schedule entry (null when none for the current time-of-day).
    // We pass its `dialogueHint` to the LLM so in-character lines reflect the
    // NPC's current activity ("я ужинаю", "сейчас моя смена патруля" etc.).
    // Only `schedule` is read by getNpcActiveSchedule, but we construct a full
    // NpcState-like object so the call type-checks even when the helper's
    // parameter type narrows to Pick<NpcState, "schedule">.
    const activeEntry = npcSchedule.length > 0
      ? getNpcActiveSchedule({ schedule: npcSchedule }, timeOfDay)
      : null;
    const dialogueHint = activeEntry?.dialogueHint ?? "";
    const currentActivity = activeEntry?.activity ?? "";
    const currentLocation = activeEntry?.location ?? "";

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
        narrative = sanitizeLLMOutput(await runLlmDialogue(npc, player, "business_unavailable", "", req.signal, dialogueHint, currentActivity, currentLocation));
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
        narrative = sanitizeLLMOutput(await runLlmDialogue(npc, player, "buy", item.name, req.signal, dialogueHint, currentActivity, currentLocation));
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
    narrative = sanitizeLLMOutput(await runLlmDialogue(npc, player, action, "", req.signal, dialogueHint, currentActivity, currentLocation));
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

/** Call the LLM in-character as the NPC. Returns a Russian in-character line.
 *  B6: `dialogueHint` + `currentActivity` + `currentLocation` come from the
 *  NPC's active schedule entry (empty when the NPC has no schedule or no
 *  entry for the current time-of-day) — they let the LLM produce time-aware
 *  in-character lines ("я ужинаю", "сейчас моя смена патруля" etc.). */
async function runLlmDialogue(
  npc: { name: string; role: string; disposition: string; notes: string; location: string },
  player: { name: string; charClass: string; raceName: string; level: number; gold: number },
  action: string,
  itemName: string,
  signal?: AbortSignal,
  dialogueHint: string = "",
  currentActivity: string = "",
  currentLocation: string = ""
): Promise<string> {
  const dispositionRu =
    npc.disposition === "friendly" ? "дружелюбный" :
    npc.disposition === "hostile" ? "враждебный" : "нейтральный";
  const roleRu =
    npc.role === "merchant" ? "торговец" :
    npc.role === "questgiver" ? "квестодатель" :
    npc.role === "ally" ? "союзник" : "враг";
  // B6: include the NPC's current schedule context in the system prompt so
  // the LLM weaves it into the in-character reply.
  const scheduleContext = [
    currentActivity ? `Сейчас занят: ${currentActivity}` : "",
    currentLocation && currentLocation !== npc.location ? `Текущее место: ${currentLocation}` : "",
    dialogueHint ? `Подсказка для ответа: ${dialogueHint}` : "",
  ].filter(Boolean).join(". ");
  const scheduleLine = scheduleContext ? `\n\nРасписание NPC: ${scheduleContext}.` : "";
  const sysMsg = `${SYSTEM_PROMPT_DIALOGUE}

Ты играешь: ${npc.name}, ${roleRu}, ${dispositionRu}${npc.location ? `, находится: ${npc.location}` : ""}.${scheduleLine}

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
    ], signal);
    if (text && text.trim().length > 10) return text.trim();
  } catch (e: any) {
    // AbortError is expected when the client disconnects — don't log it.
    if (e?.name !== "AbortError") {
      console.error("[dialogue] LLM error:", e);
    }
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

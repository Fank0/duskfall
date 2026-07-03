// Random-encounter engine — called whenever the party enters a new map room
// (see move-room/route.ts) and rolled again on every move (40% base chance).
//
// Encounter types (weighted):
//   combat   50%  — spawn 1-3 monsters scaled to party level
//   merchant 15%  — spawn a friendly NPC merchant
//   puzzle   15%  — a puzzle prompt the DM can flesh out
//   npc      10%  — spawn a friendly/neutral NPC
//   trap      5%  — damage a random player (d6 × partyLevel, DEX save for half)
//   treasure  5%  — gold + a random item

import { db } from "@/lib/db";
import { rollDice, rollD20, abilityModifier } from "./dice";
import {
  damagePlayer,
  adjustGold,
  applyInventoryChanges,
  saveChatMessage,
  upsertNpc,
  logDiceRoll,
} from "./state";

export type EncounterType =
  | "combat"
  | "merchant"
  | "puzzle"
  | "npc"
  | "trap"
  | "treasure"
  | "none";

export interface EncounterResult {
  type: EncounterType;
  summary: string; // one-line Russian summary for the DM chat
  details: {
    monsters?: { name: string; label: string; hp: number; maxHp: number; ac: number; damageNotation: string; attackBonus: number; posX: number; posY: number; color: string; description: string }[];
    npcName?: string;
    npcRole?: string;
    puzzlePrompt?: string;
    trapTarget?: string;
    trapDamage?: number;
    trapSaved?: boolean;
    treasureGold?: number;
    treasureItem?: { name: string; type: string; description: string };
  };
}

// ----- monster pool (scaled to party level) -----
interface MonsterTemplate {
  name: string;
  baseHp: number;
  ac: number;
  damageNotation: string;
  attackBonus: number;
  color: string;
  description: string;
}

const MONSTER_POOL: MonsterTemplate[] = [
  { name: "Гоблин-разведчик", baseHp: 12, ac: 13, damageNotation: "1d6+2", attackBonus: 4, color: "#16a34a", description: "Кривоногий зеленошкурый гоблин с ржавым ножом." },
  { name: "Скелет-воин", baseHp: 13, ac: 13, damageNotation: "1d6+2", attackBonus: 4, color: "#e5e7eb", description: "Бессмертный костяной страж с ржавым мечом." },
  { name: "Кобольд-копатель", baseHp: 11, ac: 12, damageNotation: "1d4+2", attackBonus: 4, color: "#a16207", description: "Мелкий чешуйчатый гуманоид с киркой." },
  { name: "Разбойник-головорез", baseHp: 14, ac: 12, damageNotation: "1d8+2", attackBonus: 4, color: "#9a3412", description: "Заросший бандит с тяжёлой булавой." },
  { name: "Болотная тварь", baseHp: 15, ac: 11, damageNotation: "1d6+2", attackBonus: 4, color: "#3f6212", description: "Слизкая гуманоидная тварь из тины." },
  { name: "Утопленник", baseHp: 13, ac: 11, damageNotation: "1d6+2", attackBonus: 4, color: "#155e75", description: "Разбухший труп моряка с чёрными глазами." },
  { name: "Теневой клон", baseHp: 10, ac: 13, damageNotation: "1d6+1", attackBonus: 4, color: "#27272a", description: "Полупрозрачная тень, повторяющая движения." },
  { name: "Павший паладин", baseHp: 18, ac: 15, damageNotation: "1d8+3", attackBonus: 5, color: "#7c2d12", description: "Бывший рыцарь веры, ныне слуга тьмы." },
  { name: "Волк-трупоед", baseHp: 11, ac: 13, damageNotation: "1d6+2", attackBonus: 5, color: "#52525b", description: "Тощий зверь с красными глазами и окровавленной пастью." },
  { name: "Гигантская крыса", baseHp: 9, ac: 12, damageNotation: "1d4+1", attackBonus: 4, color: "#78350f", description: "Сковрадная зубастая крыса размером с кошку." },
];

// ----- NPC name pool (for merchant / npc encounters) -----
const MERCHANT_NAMES = ["Брольд Камнерук", "Мадам Веспера", "Старый Краг", "Сильвия Алхимичка", "Гном Гримбольд"];
const NPC_NAMES = ["Странник Алдон", "Жрец Мортис", "Бард Эльвандер", "Отшельник Бран", "Старая Нэн"];
const PUZZLE_PROMPTS = [
  "На стене высечены руны, а в центре — каменный постамент с углублением в форме ладони.",
  "Дверь заперта; в неё вмурован металлический диск с четырьмя поворачивающимися кольцами рун.",
  "В полу — мозаика из цветных плиток. На стене надпись: «Идущий по верному цвету пройдёт».",
  "В центре зала — статуя с протянутой ладонью. У её ног — медная чаша.",
  "Стены покрыты зеркалами, а в воздухе — тихий шёпот, подсказывающий, куда смотреть.",
];

// ----- treasure pool -----
const TREASURE_ITEMS: { name: string; type: string; description: string }[] = [
  { name: "Зелье лечения", type: "potion", description: "Восстанавливает 2d4+2 HP." },
  { name: "Серебряный кинжал", type: "weapon", description: "Лёгкое серебряное оружие 1d4. Особенно против оборотней." },
  { name: "Кольцо защиты +1", type: "armor", description: "+1 к AC, пока надето." },
  { name: "Амулет здравомыслия", type: "misc", description: "Преимущество на спасброски от страха." },
  { name: "Свиток «Огненная стрела»", type: "scroll", description: "Расходуемый свиток: 3d6 урона огнём." },
  { name: "Зелье силы", type: "potion", description: "+1d4 к атакам и урону на 1 минуту." },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function rollEncounterType(): EncounterType {
  const r = Math.random() * 100;
  if (r < 50) return "combat";
  if (r < 65) return "merchant";
  if (r < 80) return "puzzle";
  if (r < 90) return "npc";
  if (r < 95) return "trap";
  return "treasure";
}

/** Scale a monster template to the party level (HP, attack, damage scale up
 *  modestly). Level is clamped to 1..5. */
function scaleMonster(t: MonsterTemplate, partyLevel: number, label: string) {
  const lvl = Math.max(1, Math.min(5, partyLevel));
  const hp = t.baseHp + (lvl - 1) * 4;
  const ac = t.ac + Math.floor((lvl - 1) / 2);
  const attackBonus = t.attackBonus + Math.floor((lvl - 1) / 2);
  return {
    name: t.name,
    label,
    hp,
    maxHp: hp,
    ac,
    damageNotation: t.damageNotation,
    attackBonus,
    posX: 7 + Math.floor(Math.random() * 3),
    posY: 1 + Math.floor(Math.random() * 2),
    color: t.color,
    description: t.description,
  };
}

export interface RollEncounterOptions {
  /** Force a particular encounter type (e.g. when entering a combat/boss room). */
  forceType?: EncounterType;
  /** Override the base 40% chance (0..1). */
  chance?: number;
}

/** Roll a random encounter for the room. Returns the result AND applies side
 *  effects (spawning monsters, creating NPCs, damaging players, awarding
 *  treasure). Returns { type: "none" } when no encounter fires.
 *
 *  `partyLevel` should be the average level of alive players (or 1 if none). */
export async function rollEncounter(
  roomId: string,
  partyLevel: number,
  round: number,
  options: RollEncounterOptions = {}
): Promise<EncounterResult> {
  const lvl = Math.max(1, Math.min(5, partyLevel));

  // Determine whether an encounter fires (forced type skips the roll).
  let type: EncounterType;
  if (options.forceType && options.forceType !== "none") {
    type = options.forceType;
  } else {
    const chance = options.chance ?? 0.4;
    if (Math.random() > chance) {
      return { type: "none", summary: "Тишина. Ничего не происходит.", details: {} };
    }
    type = rollEncounterType();
  }

  switch (type) {
    case "combat": {
      const count = 1 + Math.floor(Math.random() * 3); // 1..3
      const monsters: {
        name: string;
        label: string;
        hp: number;
        maxHp: number;
        ac: number;
        damageNotation: string;
        attackBonus: number;
        posX: number;
        posY: number;
        color: string;
        description: string;
      }[] = [];
      for (let i = 0; i < count; i++) {
        const tpl = pick(MONSTER_POOL);
        const label = `${tpl.name.slice(0, 2)}${i + 1}`;
        monsters.push(scaleMonster(tpl, lvl, label));
      }
      // Persist as hidden monsters (revealed when combat triggers via attack).
      await db.monster.createMany({
        data: monsters.map((m) => ({ ...m, roomId, isActive: false })),
      });
      const summary = `Боевая встреча! Появились: ${monsters.map((m) => m.name).join(", ")}.`;
      return { type, summary, details: { monsters } };
    }
    case "merchant": {
      const name = pick(MERCHANT_NAMES);
      await upsertNpc(roomId, name, "merchant", "neutral", "У прилавка", "Странствующий торговец.");
      const summary = `Торговец ${name} раскладывает товары у прилавка.`;
      return { type, summary, details: { npcName: name, npcRole: "merchant" } };
    }
    case "puzzle": {
      const prompt = pick(PUZZLE_PROMPTS);
      const summary = `Загадка: ${prompt}`;
      return { type, summary, details: { puzzlePrompt: prompt } };
    }
    case "npc": {
      const name = pick(NPC_NAMES);
      const disposition = Math.random() < 0.7 ? "friendly" : "neutral";
      await upsertNpc(roomId, name, "ally", disposition, "У стены", "Странствующий путник.");
      const summary = `Вы встречаете ${name} (${disposition === "friendly" ? "дружелюбный" : "нейтральный"}).`;
      return { type, summary, details: { npcName: name, npcRole: "ally" } };
    }
    case "trap": {
      // Pick a random alive player as the trap victim.
      const players = await db.player.findMany({ where: { roomId, isAlive: true } });
      const alive = players.filter((p) => p.hp > 0);
      if (alive.length === 0) {
        return { type: "none", summary: "Ловушка не сработала — некому в неё угодить.", details: {} };
      }
      const victim = pick(alive);
      // Damage = d6 × partyLevel; DEX save DC 12 for half.
      const saveDC = 12;
      const dexMod = abilityModifier(victim.dex);
      const saveRoll = rollD20(dexMod);
      const saved = saveRoll.total >= saveDC;
      const baseDmg = rollDice(`${lvl}d6`).total;
      const dmg = saved ? Math.floor(baseDmg / 2) : baseDmg;
      await damagePlayer(roomId, victim.name, dmg);
      // Log the save roll so it appears in the dice log.
      await logDiceRoll(roomId, round, victim.name, {
        label: `Спасбросок ЛОВ (ловушка)`,
        notation: "1d20",
        modifier: dexMod,
        result: saveRoll.rolls[0],
        total: saveRoll.total,
        target: saveDC,
        success: saved,
        purpose: "trap_save",
      });
      await logDiceRoll(roomId, round, victim.name, {
        label: `Урон ловушки${saved ? " (половина, спас)" : ""}`,
        notation: `${lvl}d6`,
        modifier: 0,
        result: baseDmg,
        total: dmg,
        purpose: "trap_damage",
      });
      const summary = `Ловушка! ${victim.name} получает ${dmg} урона (${saved ? "спасбросок успешен, половина" : "спасбросок провален"}).`;
      return {
        type,
        summary,
        details: { trapTarget: victim.name, trapDamage: dmg, trapSaved: saved },
      };
    }
    case "treasure": {
      const gold = 10 + Math.floor(Math.random() * (20 * lvl + 1));
      const item = pick(TREASURE_ITEMS);
      // Award gold + item to the first alive player (the "finder").
      const players = await db.player.findMany({ where: { roomId, isAlive: true } });
      const alive = players.filter((p) => p.hp > 0);
      if (alive.length === 0) {
        return { type: "none", summary: "Сундук пылится — некому забрать.", details: {} };
      }
      const finder = alive[0];
      await adjustGold(roomId, finder.name, gold);
      await applyInventoryChanges(roomId, finder.name, [
        { action: "add", item: item.name, type: item.type, description: item.description },
      ]);
      const summary = `Сокровище! ${finder.name} находит ${gold} золота и «${item.name}».`;
      return {
        type,
        summary,
        details: { treasureGold: gold, treasureItem: item },
      };
    }
    default:
      return { type: "none", summary: "Тишина.", details: {} };
  }
}

/** Persist the encounter's summary as a DM chat message in the room. */
export async function logEncounter(
  roomId: string,
  round: number,
  result: EncounterResult
): Promise<void> {
  if (result.type === "none") return;
  await saveChatMessage(roomId, "dm", "", result.summary, round);
}

// The AI Dungeon Master agent (multiplayer, initiative-based turn order).
//
// Per player action:
//   1. Verify it's the actor's turn (during combat) or combat is inactive.
//   2. Fetch game context from the DB.
//   3. LLM call #1 — plan mechanics (rolls, DC/AC, effects) as JSON.
//   4. Roll the dice (backend, fair RNG).
//   5. Resolve the outcome (HP, inventory, grid, gold) — NO monster turn here.
//   6. If the action triggered combat, roll initiative and set turn order.
//   7. LLM call #2 — narrate the resolved action in Russian.
//   8. Advance the turn (runs monster turns automatically until a player is up).
//
// Monster turns are run by `advanceTurn`, not by the player-action path.

import { db } from "@/lib/db";
import { chatComplete, chatStream } from "./llm";
import {
  getDMContext,
  getSnapshot,
  logDiceRoll,
  damageMonster,
  damagePlayer,
  healPlayer,
  moveToken,
  moveMonsterTowardNearestPlayer,
  applyInventoryChanges,
  adjustGold,
  setRoomState,
  rollInitiative,
  countAlive,
  nearestActiveMonster,
  GRID_SIZE,
  awardXP,
  xpForMonster,
  advanceExplorationTurn,
  applyCondition,
  tickConditions,
  spendSpellSlot,
  computeAoECells,
  createQuest,
  updateQuestStatus,
  upsertNpc,
} from "./state";
import { rollDice, rollD20, rollD20Advantage, abilityModifier } from "./dice";
import { extractJson } from "./json";
import { getCondition, attackBonusDice } from "./conditions";
import {
  getClassIdByCharClass,
  isCasterClass,
  SLOT_CONSUMING_ABILITIES,
} from "./presets";
import {
  damageBonusFromTalents,
  applyDamageReduction,
  rollVampiricHeal,
  rollHealOnKill,
  healOnKillNotation,
  effectiveAC,
  rollCounterattack,
} from "./talents";
import type {
  DMResolution,
  ResolvedRoll,
  ResolvedEvent,
  InventoryChange,
  PlayerState,
  MonsterState,
  PlannedCondition,
} from "./types";


/** Parse a JSON spell-slot string into a Record<string, number>. Defensive. */
function parseSlotsSafe(raw: string | null | undefined): Record<string, number> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = Math.max(0, Math.floor(Number(v) || 0));
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return {};
}


// ---------- Positional advantage: flanking & high ground ----------
/** True if an ally of the attacker is on the opposite side of the target
 *  (same row or column, equidistant, both adjacent to the target).
 *  Represents D&D 5e flanking — melee only (attacker must be adjacent). */
export function hasFlanking(
  attacker: { posX: number; posY: number },
  target: { posX: number; posY: number },
  allies: { posX: number; posY: number }[]
): boolean {
  const dx = attacker.posX - target.posX;
  const dy = attacker.posY - target.posY;
  // Attacker must be adjacent to the target (Chebyshev distance 1).
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return false;
  for (const ally of allies) {
    const alx = ally.posX - target.posX;
    const aly = ally.posY - target.posY;
    // Ally must be adjacent to the target.
    if (Math.max(Math.abs(alx), Math.abs(aly)) !== 1) continue;
    // Same row (dy==0, aly==0): opposite x, equidistant.
    if (dy === 0 && aly === 0 && Math.sign(alx) === -Math.sign(dx) && Math.abs(alx) === Math.abs(dx)) {
      return true;
    }
    // Same column (dx==0, alx==0): opposite y, equidistant.
    if (dx === 0 && alx === 0 && Math.sign(aly) === -Math.sign(dy) && Math.abs(aly) === Math.abs(dy)) {
      return true;
    }
  }
  return false;
}

/** True if the attacker is at least 3 cells higher (greater Y) than the target.
 *  Ranged-only positional advantage — high ground gives advantage on attacks. */
export function hasHighGround(
  attacker: { posX: number; posY: number },
  target: { posX: number; posY: number }
): boolean {
  return attacker.posY >= target.posY + 3;
}

/** Combined positional advantage check: flanking (melee/adjacent) OR
 *  high ground (ranged/non-adjacent). Returns true if the attacker gets
 *  advantage from positioning. */
export function computePositionalAdvantage(
  attacker: { posX: number; posY: number },
  target: { posX: number; posY: number },
  allies: { posX: number; posY: number }[]
): boolean {
  const dist = Math.max(Math.abs(attacker.posX - target.posX), Math.abs(attacker.posY - target.posY));
  const isMelee = dist <= 1;
  const isRanged = dist > 1;
  if (isMelee && hasFlanking(attacker, target, allies)) return true;
  if (isRanged && hasHighGround(attacker, target)) return true;
  return false;
}


const SYSTEM_PROMPT_PLANNING = `Ты — Мастер Подземелий для D&D 5e, ведущий тёмное фэнтези-приключение для группы героев. Твоя задача — спланировать механику разрешения действия ОДНОГО героя.

=== ШАГ 0: ПРОВЕРКА ВОЗМОЖНОСТИ ДЕЙСТВИЯ (ВАЖНЕЙШИЙ ШАГ) ===
ПРЕЖДЕ чем планировать броски, проверь, ВОЗМОЖНО ли действие вообще. Действие НЕВОЗМОЖНО (category="invalid"), если:
1. ПРЕДМЕТЫ: герой пытается использовать предмет, которого НЕТ в его инвентаре (например «стреляю из лука», а лука нет; «пью зелье», а зелья нет; «читаю свиток», а свитка нет). Сверяйся с инвентарем в контексте!
2. ОРУЖИЕ: герой пытается атаковать оружием, которого у него нет. У героя есть только weaponName из контекста. Если он говорит «бью мечом», а у него «Короткий лук» — это invalid.
3. Восприятие: герой действует на основе того, чего он не видел/не может знать (например «открываю тайную дверь за статуей», если он её не обнаружил; «бью гоблина за углом», если гоблина не видно). Действовать можно только на основе известного.
4. Физика/логика: действие противоречит реальности (пролезть в щель размером с кошку, прыгнуть на 20 метров, поднять 500 кг).
5. Эпоха: упоминание пороха, огнестрела, электричества, современных технологий.
Если действие невозможно — верни category="invalid" и invalidReason (короткое объяснение на русском, почему невозможно). Ход при этом НЕ тратится.

=== НЕПРЕЛОЖНЫЕ ПРАВИЛА АТМОСФЕРЫ И РЕАЛИЗМА ===
1. ПРЕДМЕТЫ: у героя есть ТОЛЬКО то, что в инвентаре. НЕ добавляй предметы по желанию игрока. Предметы добываются только через исследование/loot/награду.
2. ЭПОХА: строго псевдосредневековое тёмное фэнтези. Запрещены огнестрел, порох, электричество, современные механизмы.
3. УНИКАЛЬНОСТЬ: каждое приключение уникально, не повторяй локации/сюжеты.
4. СВОБОДА С ПОСЛЕДСТВИЯМИ: провальная проверка = реальное последствие. Не подыгрывай.
5. БАЛАНС: уровни 1-3 — враги 10-15 HP, урон 1d6+2. Артефакты имеют недостаток. ≤50 золота за сессию.
6. АТМОСФЕРА: тёмное фэнтези, мрачное, опасное, моральная серость.
7. ВОСПРИЯТИЕ: герой знает только то, что описал Мастер в недавних событиях. Не позволяй действовать на основе скрытой информации.

ПРАВИЛА:
- Модификатор характеристики = (характеристика-10)/2.
- Бонус атаки ближнего боя = мод СИЛ + бонус мастерства; дальнего боя = мод ЛОВ + бонус мастерства.
- Для проверки характеристики: rolls = [{notation:"1d20", modifier:<мод, +бонус мастерства если proficiency>, target:<DC>, target_type:"DC", ability:"<ХАР>"}].
- Для атаки по противнику: rolls = [{notation:"1d20", modifier:<бонус атаки>, target:<AC противника из контекста>, target_type:"AC"}].
- DC: лёгкие 8-10, средние 12-14, сложные 15-18, очень сложные 19-22.
- Если бросок не нужен (разговор, осмотр без риска), rolls = [] и успех автоматический.
- Урон оружия героя бери из контекста (weaponNotation). В success.monsterDamage.notation указывай именно его.
- В success.monsterDamage.target — ТОЧНОЕ имя противника из контекста.
- В failure.playerDamage — урон контратаки врага, если уместно (иначе null).
- tokenMoves двигай ТОЛЬКО действующего героя. Координаты 0..9.
- Лечение: healing.notation (например "2d4+2"). target — имя героя.

СОСТОЯНИЯ (Conditions):
Доступные типы состояний (используй их в поле "conditions"):
- "poisoned" (🤢 Отравлен) — помеха на атаки и проверки. Ядовитое оружие, ядовитые газы.
- "stunned" (💫 Оглушён) — пропускает ход. Оглушающий удар, громкий звук.
- "frightened" (😨 Напуган) — помеха на проверки. Жуткий рёв, магия страха.
- "burning" (🔥 Горит) — 1d4 урона огнём каждый раунд. Пламя, поджог.
- "slowed" (🐌 Замедлен) — скорость вдвое. Лёд, тина, тяжёлые оковы.
- "blinded" (🙈 Ослеплён) — помоха на атаки. Яркая вспышка, грязь в глазах.
- "prone" (⬇️ Сбит с ног) — скорость вдвое. Сбит ударами, поскользнулся.
- "blessed" (✨ Благословен) — +1d4 к атакам и спасброскам. Благословение жреца.
- "shielded" (🛡️ Под щитом) — +2 к AC. Магический щит, барьер.
- "weakened" (💀 Ослаблен) — помеха на атаки. Колдовство, проклятие, болезнь.

Поле conditions — массив объектов { target, type, duration, source }:
- target: точное имя героя/монстра из контекста.
- type: один из перечисленных выше идентификаторов.
- duration: целое число раундов (обычно 2-4).
- source: что применило состояние (заклинание, способность, предмет).
Пример: "conditions": [ { "target": "Гоблин-разведчик", "type": "burning", "duration": 3, "source": "Огненная стрела" } ]
Не каждое действие накладывает состояние — добавляй только когда это уместно (например, кислота, огонь, яд, оглушение, страх).

ЖУРНАЛ КВЕСТОВ (Quest Journal):
Если действие героя даёт новую задачу, продвигает или завершает текущую — заполни поле "quest" внутри success (или failure, если квест проваливается):
- "title": краткое название квеста на русском.
- "description": 1-2 предложения, что нужно сделать.
- "objectives": цели через запятую (например "Найти амулет, Вернуться к жрецу").
- "reward": награда на русском (например "150 золота, зелье лечения").
- "status": "active" (новый квест), "completed" (выполнен), "failed" (провален).
Для нового квеста — status="active". Если квест с таким title уже в журнале — используй "completed"/"failed" для его завершения.
Не каждое действие создаёт квест — добавляй поле только когда это уместно (получено задание от NPC, найдена важная цель, выполнена задача).

NPC (неигровые персонажи):
Если в результате действия в локации появляется новый NPC (торговец, квестодатель, союзник, враг) — заполни поле "npc" внутри success:
- "name": имя NPC на русском.
- "role": "merchant" | "questgiver" | "ally" | "enemy".
- "disposition": "friendly" | "neutral" | "hostile".
- "location": где стоит ("У прилавка", "У костра") — необязательно.
- "notes": краткое описание/заметка — необязательно.
Не каждое действие создаёт NPC — добавляй только когда герой знакомится с новым персонажем.

ПРЕИМУЩЕСТВО / ПОМЕХА (Advantage/Disadvantage):
Поле "advantage" на верхнем уровне JSON задаёт режим броска атаки:
- "advantage" — герой кидает 2d20 и берёт больший (атака из засады, со спины, по оглушённому/ослеплённому врагу, благоприятная позиция).
- "disadvantage" — кидает 2d20 и берёт меньший (атака в темноте без тёмного зрения, сквозь преграду, в движении, дальнобойная атака в ближнем бою).
- "none" или отсутствие поля — обычный бросок 1d20.
Состояния тоже влияют: poisoned/blinded/prone/frightened у атакующего → помеха; blinded/prone/stunned у цели → преимущество атакующему. Если есть и то, и другое — они взаимно сокращаются и бросок обычный.
Бонус blessed (+1d4 к атакам и спасброскам) применяется автоматически — НЕ задавай advantage для blessed.

ПОЗИЦИОНИРОВАНИЕ (Фланги и высокое положение):
Бэкенд АВТОМАТИЧЕСКИ проверяет позицию атакующего и при возможности даёт преимущество — НЕ нужно задавать "advantage" для этих случаев:
- ФЛАНГ: если герой атакует врага в ближнем бою (соседняя клетка) и союзник героя стоит на противоположной стороне того же врага (та же строка или столбец, равноудалён) — атака с преимуществом.
- ВЫСОКОЕ ПОЛОЖЕНИЕ: если герой атакует дальнобойным оружием (враг не в соседней клетке) и стоит минимум на 3 клетки выше цели (большее Y) — атака с преимуществом.
Эти бонусы складываются с состояниями по обычным правилам (преимущество + помеха = обычный бросок). В нарративе можешь упомянуть фланг или возвышенность, но в JSON advantage для них ставить не нужно.

ЗОНАЛЬНЫЕ ЗАКЛИНАНИЯ (AoE):
Для заклинаний, поражающих область (Огненный шар, Молния, Конус холода, Грозовой разряд, Серный туман, Огненная стена и т.п.), НЕ задавай rolls (атак-броска нет — вместо него спасброски целей). Вместо этого заполни поля:
- "aoeShape": "circle" | "cone" | "line" — форма области.
  · circle — круг радиуса aoeSize клеток вокруг aoeOrigin (Огненный шар: circle, size 2).
  · line — линия длиной aoeSize клеток от aoeOrigin в направлении aoeDirection (Молния: line, size 8, direction {x:0,y:-1} или {x:1,y:0} и т.п.).
  · cone — конус глубиной aoeSize клеток от aoeOrigin вдоль aoeDirection (Конус холода: cone, size 4).
- "aoeSize": целое число клеток (обычно 2-4 для круга/конуса, 6-8 для линии).
- "aoeOrigin": { "x": <0..9>, "y": <0..9> } — точка-центр (для круга) или начало (для линии/конуса). Ближайшая к врагу клетка от позиции героя.
- "aoeDirection": { "x": <-1|0|1>, "y": <-1|0|1> } — вектор направления линии/конуса. Для круга не нужен.
- "saveAbility": "ЛОВ" (уклонение, огонь/молния), "ТЕЛ" (холод/яд/кислота), "МУД" (очарование), "СИЛ" (сила). По умолчанию "ТЕЛ".
- "saveDC": класс сложности спасброска (8 + бонус мастерства + мод. характеристики заклинателя). Обычно 12-16 для ур.1-3.
- "aoeElement": "fire" | "cold" | "lightning" | "acid" | "force" | "poison" | "thunder" — стихия (для цвета подсветки).
В success.monsterDamage.notation укажи урон заклинания (например "8d6" для Огненного шара, "8d6" для Молнии, "8d8" для Конуса холода). Цели в области кидают спасбросок: при провале — полный урон, при успехе — половина. Герой-заклинатель НЕ получает урон от своей области.

ВЫВОД: только валидный JSON без пояснений, по схеме:
{
  "category": "combat|exploration|social|ability_check|invalid|other",
  "invalidReason": "короткое объяснение на русском почему действие невозможно (только если category=invalid, иначе пустая строка)",
  "advantage": "none|advantage|disadvantage",
  "aoeShape": "circle|cone|line",
  "aoeSize": 2,
  "aoeOrigin": { "x": 5, "y": 3 },
  "aoeDirection": { "x": 0, "y": -1 },
  "saveAbility": "ЛОВ",
  "saveDC": 14,
  "aoeElement": "fire",
  "rolls": [ { "label": "...", "notation": "1d20", "modifier": 5, "target": 13, "target_type": "AC", "ability": "СИЛ" } ],
  "success": {
    "narrative": "что происходит при успехе (2-3 предложения, без цифр урона)",
    "monsterDamage": { "notation": "1d8+3", "target": "Гоблин-разведчик" },
    "playerDamage": null, "healing": null,
    "inventory": [ { "action": "add", "item": "Название", "type": "potion", "description": "..." } ],
    "tokenMoves": [ { "name": "Имя героя", "newX": 2, "newY": 7 } ],
    "conditions": [ { "target": "Гоблин-разведчик", "type": "burning", "duration": 3, "source": "Огненная стрела" } ],
    "quest": null,
    "npc": null,
    "monsterDies": false, "goldChange": 0, "sceneChange": false
  },
  "failure": {
    "narrative": "...", "monsterDamage": null,
    "playerDamage": { "notation": "1d6+2" }, "healing": null,
    "inventory": [], "tokenMoves": [],
    "conditions": [],
    "quest": null,
    "npc": null,
    "monsterDies": false, "goldChange": 0, "sceneChange": false
  },
  "imagePrompt": "english dark fantasy scene description, detailed",
  "imageNeeded": true
}

ВАЖНО: narrative пиши на русском, тёмное фэнтези, атмосферно. Если в контексте есть "Скрытые угрозы", герой может атаковать их — тогда бой начнётся автоматически. При category="invalid" success/failure можно заполнить пустыми — они не используются.`;

const SYSTEM_PROMPT_NARRATION = `Ты — Мастер Подземелий для D&D 5e. Напиши насыщенное, атмосферное повествование на РУССКОМ языке в стиле тёмного фэнтези (3-6 предложений) для разрешённого действия героя. Вплети реальные результаты бросков и урона. Опиши действия героя и реакцию противника. Не используй markdown. Не повторяйся. Будь кинематографичен.`;

// ---------- LLM helpers ----------
async function planResolution(
  roomCode: string,
  actorName: string,
  playerAction: string
): Promise<DMResolution> {
  const context = await getDMContext(roomCode, actorName);
  const userMsg = `КОНТЕКСТ ИГРЫ:\n${context}\n\nДЕЙСТВУЮЩИЙ ГЕРОЙ: ${actorName}\nДЕЙСТВИЕ: ${playerAction}\n\nСпланируй механику разрешения. Верни только JSON.`;
  try {
    const raw = await chatComplete([
      { role: "system", content: SYSTEM_PROMPT_PLANNING },
      { role: "user", content: userMsg },
    ]);
    const parsed = extractJson<DMResolution>(raw);
    if (parsed && parsed.success && parsed.failure) return parsed;
  } catch (e) {
    console.error("[DM] planResolution error:", e);
  }
  return fallbackResolution(playerAction);
}

/** Combined plan + narrative in ONE LLM call (saves the second ~5s round-trip).
 *  Returns the DMResolution (mechanics) plus a ready-to-use narrative. */
export async function planAndNarrate(
  roomCode: string,
  actorName: string,
  playerAction: string
): Promise<{ plan: DMResolution; narrative: string }> {
  const context = await getDMContext(roomCode, actorName);
  const userMsg = `КОНТЕКСТ ИГРЫ:\n${context}\n\nДЕЙСТВУЮЩИЙ ГЕРОЙ: ${actorName}\nДЕЙСТВИЕ: ${playerAction}\n\nСпланируй механику И напиши нарратив в одном ответе. Верни только JSON.`;
  try {
    const raw = await chatComplete([
      { role: "system", content: SYSTEM_PROMPT_COMBINED },
      { role: "user", content: userMsg },
    ]);
    const parsed = extractJson<DMResolution & { narrative: string }>(raw);
    if (parsed && parsed.success && parsed.failure) {
      const narrative = parsed.narrative || parsed.success.narrative || parsed.failure.narrative;
      return { plan: parsed, narrative };
    }
  } catch (e) {
    console.error("[DM] planAndNarrate error:", e);
  }
  // Fallback: separate calls (slower but reliable).
  const plan = await planResolution(roomCode, actorName, playerAction);
  return { plan, narrative: plan.success.narrative };
}

const SYSTEM_PROMPT_COMBINED = SYSTEM_PROMPT_PLANNING.replace(
  'ВАЖНО: narrative пиши на русском, тёмное фэнтези, атмосферно. Если в контексте есть "Скрытые угрозы", герой может атаковать их — тогда бой начнётся автоматически. При category="invalid" success/failure можно заполнить пустыми — они не используются.',
  `ВАЖНО: narrative пиши на русском, тёмное фэнтези, атмосферно (2-4 предложения, кратко и кинематографично). Если в контексте есть "Скрытые угрозы", герой может атаковать их — тогда бой начнётся автоматически.

ОБЯЗАТЕЛЬНО добавь поле "narrative" в верхний уровень JSON — это финальный нарратив на русском (2-4 предложения) для итога действия (при category="invalid" — объяснение игроку почему невозможно; иначе — описание произошедшего с учётом успеха/провала бросков).`
);

function fallbackResolution(playerAction: string): DMResolution {
  return {
    category: "ability_check",
    rolls: [
      { label: "Проверка", notation: "1d20", modifier: 2, target: 12, target_type: "DC", ability: "СИЛ" },
    ],
    success: {
      narrative:
        "Твои усилия увенчались успехом — обстоятельства складываются в твою пользу.",
      monsterDamage: null, playerDamage: null, healing: null,
      inventory: [], tokenMoves: [], monsterDies: false, goldChange: 0, sceneChange: false,
    },
    failure: {
      narrative:
        "Удача отворачивается — замысел не удаётся, и приходится искать иной путь.",
      monsterDamage: null, playerDamage: null, healing: null,
      inventory: [], tokenMoves: [], monsterDies: false, goldChange: 0, sceneChange: false,
    },
    imagePrompt: "Dark fantasy scene, misty forest, torchlight, ominous atmosphere, painterly concept art",
    imageNeeded: false,
  };
}

async function narrateAction(
  roomCode: string,
  actorName: string,
  playerAction: string,
  data: {
    playerRolls: ResolvedRoll[];
    outcome: "success" | "failure";
    branchNarrative: string;
    damageToMonster: number;
    monsterThatDied: string | null;
    inventoryChanges: InventoryChange[];
    goldChange: number;
    location: string;
  }
): Promise<string> {
  const lines: string[] = [];
  lines.push(`Локация: ${data.location}`);
  lines.push(`Герой: ${actorName}`);
  lines.push(`Действие: ${playerAction}`);
  lines.push(`Исход: ${data.outcome === "success" ? "УСПЕХ" : "ПРОВАЛ"}`);
  for (const r of data.playerRolls) {
    lines.push(
      `- ${r.label}: ${r.notation}${r.modifier >= 0 ? "+" : ""}${r.modifier} = ${r.total} (выпало ${r.result})${r.target ? `, цель ${r.target}` : ""} → ${r.success ? "успех" : "провал"}`
    );
  }
  if (data.damageToMonster > 0) lines.push(`Урон противнику: ${data.damageToMonster}`);
  if (data.monsterThatDied) lines.push(`Повержен: ${data.monsterThatDied}`);
  if (data.inventoryChanges.length > 0)
    lines.push("Изменения инвентаря: " + data.inventoryChanges.map((c) => `${c.action === "add" ? "+" : "-"}${c.item}`).join(", "));
  if (data.goldChange) lines.push(`Золото: ${data.goldChange > 0 ? "+" : ""}${data.goldChange}`);
  lines.push(`Заготовка нарратива: ${data.branchNarrative}`);

  try {
    const text = await chatComplete([
      { role: "system", content: SYSTEM_PROMPT_NARRATION },
      { role: "user", content: `Напиши повествование:\n${lines.join("\n")}` },
    ]);
    if (text && text.trim().length > 20) return text.trim();
  } catch (e) {
    console.error("[DM] narrateAction error:", e);
  }
  return data.branchNarrative;
}

/** Stream the action narrative token-by-token. Yields text chunks as they arrive. */
export async function* streamNarrativeAction(
  roomCode: string,
  actorName: string,
  playerAction: string,
  data: {
    playerRolls: ResolvedRoll[];
    outcome: "success" | "failure";
    branchNarrative: string;
    damageToMonster: number;
    monsterThatDied: string | null;
    inventoryChanges: InventoryChange[];
    goldChange: number;
    location: string;
  }
): AsyncGenerator<string> {
  const lines: string[] = [];
  lines.push(`Локация: ${data.location}`);
  lines.push(`Герой: ${actorName}`);
  lines.push(`Действие: ${playerAction}`);
  lines.push(`Исход: ${data.outcome === "success" ? "УСПЕХ" : "ПРОВАЛ"}`);
  for (const r of data.playerRolls) {
    lines.push(`- ${r.label}: ${r.notation}${r.modifier >= 0 ? "+" : ""}${r.modifier} = ${r.total} → ${r.success ? "успех" : "провал"}`);
  }
  if (data.damageToMonster > 0) lines.push(`Урон противнику: ${data.damageToMonster}`);
  if (data.monsterThatDied) lines.push(`Повержен: ${data.monsterThatDied}`);
  if (data.goldChange) lines.push(`Золото: ${data.goldChange > 0 ? "+" : ""}${data.goldChange}`);
  lines.push(`Заготовка: ${data.branchNarrative}`);

  try {
    let full = "";
    for await (const delta of chatStream([
      { role: "system", content: SYSTEM_PROMPT_NARRATION },
      { role: "user", content: `Напиши повествование (3-5 предложений):\n${lines.join("\n")}` },
    ])) {
      full += delta;
      yield delta;
    }
    if (full.trim().length > 20) return;
  } catch (e) {
    console.error("[DM] streamNarrativeAction error:", e);
  }
  // Fallback: yield the branch narrative as a single chunk.
  yield data.branchNarrative;
}

async function narrateMonsterTurn(
  roomCode: string,
  data: {
    monsterName: string;
    moved: boolean;
    targetName: string | null;
    hit: boolean | null;
    damage: number;
    attackTotal: number | null;
    ac: number | null;
    location: string;
  }
): Promise<string> {
  const lines: string[] = [];
  lines.push(`Локация: ${data.location}`);
  lines.push(`Ход монстра: ${data.monsterName}`);
  if (data.moved) {
    lines.push(`Монстр приближается к ${data.targetName}.`);
  } else if (data.hit === null) {
    lines.push("Монстр маневрирует.");
  } else if (data.hit) {
    lines.push(`Атака попадает по ${data.targetName}: бросок ${data.attackTotal} против AC ${data.ac}, урон ${data.damage}.`);
  } else {
    lines.push(`Атака промахивается по ${data.targetName}: бросок ${data.attackTotal} против AC ${data.ac}.`);
  }
  try {
    const text = await chatComplete([
      { role: "system", content: SYSTEM_PROMPT_NARRATION },
      { role: "user", content: `Напиши короткое повествование (2-4 предложения) хода монстра:\n${lines.join("\n")}` },
    ]);
    if (text && text.trim().length > 15) return text.trim();
  } catch (e) {
    console.error("[DM] narrateMonsterTurn error:", e);
  }
  // fallback
  if (data.moved) return `${data.monsterName} с рыком бросается вперёд, сокращая дистанцию до ${data.targetName}.`;
  if (data.hit) return `${data.monsterName} бьёт ${data.targetName} и попадает — ${data.damage} урона!`;
  if (data.hit === false) return `${data.monsterName} замахивается по ${data.targetName}, но промахивается.`;
  return `${data.monsterName} маневрирует на поле боя.`;
}

// ---------- core resolution (no monster turn, no advance) ----------
interface ResolutionResult {
  playerRolls: ResolvedRoll[];
  outcome: "success" | "failure";
  damageDealtToMonster: number;
  monsterThatDied: string | null;
  damageDealtToPlayer: number;
  damagedPlayer: string | null;
  healingToPlayer: number;
  healedPlayer: string | null;
  inventoryChanges: InventoryChange[];
  goldChange: number;
  category: string;
  imagePrompt: string;
  imageNeeded: boolean;
  branchNarrative: string;
  appliedConditionCount: number;
  aoe?: {
    shape: "circle" | "cone" | "line";
    size: number;
    origin: { x: number; y: number };
    cells: { x: number; y: number }[];
    element: string;
    saveDC?: number;
    saveAbility?: string;
  };
}

async function resolvePlayerAction(
  roomCode: string,
  roomId: string,
  actorName: string,
  playerAction: string,
  round: number,
  plan: DMResolution
): Promise<ResolutionResult> {
  // Fetch the acting player's full state (for talent modifiers).
  const snap0 = await getSnapshot(roomCode);
  const actorState: PlayerState | undefined = snap0?.players.find((p) => p.name === actorName);
  // The actor should always exist at this point (verified upstream), but
  // guard against an undefined snapshot defensively so talent helpers don't
  // crash — pass a no-talent stub PlayerState instead.
  const actor: PlayerState = actorState ?? {
    id: "", name: actorName, charClass: "", level: 1,
    hp: 1, maxHp: 1, ac: 10,
    str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
    proficiencyBonus: 2, gold: 0, posX: 0, posY: 0,
    color: "#888", weaponName: "", weaponNotation: "1d4",
    portraitUrl: null, isHost: false, isAlive: true,
    race: "human", raceName: "Человек", background: "soldier", backgroundName: "Солдат",
    xp: 0, selectedTalents: [],
    bonusStr: 0, bonusDex: 0, bonusCon: 0,
    bonusInt: 0, bonusWis: 0, bonusCha: 0,
    pendingLevelUp: false,
    pendingASI: false,
    spellSlots: {}, maxSpellSlots: {}, hitDice: 8,
    equipment: { weapon: null, shield: null, head: null, chest: null, legs: null, hands: null, accessory1: null, accessory2: null },
  };
  const playerRolls: ResolvedRoll[] = [];
  let outcome: "success" | "failure" = "success";

  // Precompute advantage mode for attack rolls based on the DM plan, the
  // attacker's conditions, and the target's conditions (if any).
  const allConds = snap0?.conditions ?? [];
  const attackerCondIds = allConds
    .filter((c) => c.targetName === actorName)
    .map((c) => c.condition);
  // Attacker with these conditions rolls attacks at disadvantage.
  const ATTACKER_DISADV_CONDS = ["poisoned", "blinded", "prone", "frightened"];
  const attackerHasDisadv = attackerCondIds.some((t) => ATTACKER_DISADV_CONDS.includes(t));
  // Target with these conditions gives the attacker advantage.
  const TARGET_ADV_CONDS = ["blinded", "prone", "stunned"];
  // Blessed condition grants +1d4 to attack rolls and saves (not advantage).
  const blessedDice = attackBonusDice(attackerCondIds); // 4 for bless, 0 otherwise
  // Identify the attack target up front (used for target-condition lookup).
  const attackTargetName =
    plan.success?.monsterDamage?.target ?? plan.failure?.monsterDamage?.target ?? null;
  const targetCondIds = attackTargetName
    ? allConds.filter((c) => c.targetName === attackTargetName).map((c) => c.condition)
    : [];
  const targetGivesAdv = targetCondIds.some((t) => TARGET_ADV_CONDS.includes(t));

  // ===== Positional advantage: flanking (melee) and high ground (ranged) =====
  // Look up the target monster's position (if the target is a monster).
  const targetMonster = attackTargetName
    ? snap0?.monsters.find((m) => m.name === attackTargetName && m.isActive) ?? null
    : null;
  const allies = snap0?.players.filter((p) => p.name !== actorName && p.isAlive && p.hp > 0) ?? [];
  const positionalAdv = targetMonster
    ? computePositionalAdvantage(actor, targetMonster, allies)
    : false;

  if (plan.rolls.length > 0) {
    for (const r of plan.rolls) {
      const isAttackRoll = r.target_type === "AC";
      // Compute effective advantage mode for attack rolls only.
      let adv: "advantage" | "disadvantage" | "none" = "none";
      if (isAttackRoll) {
        if (plan.advantage === "advantage") adv = "advantage";
        else if (plan.advantage === "disadvantage") adv = "disadvantage";
        if (attackerHasDisadv) {
          // Disadvantage from attacker — cancels plan advantage.
          adv = adv === "advantage" ? "none" : "disadvantage";
        }
        if (targetGivesAdv) {
          // Advantage from target — cancels plan/attacker disadvantage.
          adv = adv === "disadvantage" ? "none" : "advantage";
        }
        if (positionalAdv) {
          // Flanking / high ground — cancels disadvantage, sets advantage.
          adv = adv === "disadvantage" ? "none" : "advantage";
        }
      }

      // Bonus dice (blessed = +1d4) apply to attack rolls and ability checks (saves).
      let bonusDice = 0;
      if (blessedDice > 0) {
        bonusDice = Math.floor(Math.random() * blessedDice) + 1;
      }

      let result: number;
      let total: number;
      let allRolls: number[] | undefined;
      let advantageMode: "advantage" | "disadvantage" | "none" | null = null;

      if (isAttackRoll && (adv === "advantage" || adv === "disadvantage")) {
        // Roll 2d20, keep higher (advantage) or lower (disadvantage).
        const ar = rollD20Advantage(adv, r.modifier + bonusDice);
        result = ar.result;
        total = ar.total;
        allRolls = ar.rolls;
        advantageMode = adv;
      } else {
        const res = rollDice(r.notation, r.modifier);
        result = res.raw;
        total = res.total + bonusDice;
        allRolls = bonusDice > 0 ? [res.raw] : undefined;
        if (isAttackRoll) advantageMode = adv === "none" ? "none" : null;
      }

      const success = r.target_type === "none" ? true : total >= r.target;
      const rr: ResolvedRoll = {
        label: r.label,
        notation: r.notation,
        modifier: r.modifier + bonusDice,
        result,
        total,
        target: r.target_type === "none" ? undefined : r.target,
        success,
        purpose: r.ability || "action",
        advantageMode,
        allRolls,
      };
      playerRolls.push(rr);
      await logDiceRoll(roomId, round, actorName, rr);
    }
    outcome = playerRolls.every((r) => r.success) ? "success" : "failure";
  }

  const branch = outcome === "success" ? plan.success : plan.failure;

  let damageDealtToMonster = 0;
  let monsterThatDied: string | null = null;
  let damageDealtToPlayer = 0;
  let damagedPlayer: string | null = null;
  let healingToPlayer = 0;
  let healedPlayer: string | null = null;
  const inventoryChanges: InventoryChange[] = branch.inventory || [];
  let goldChange = branch.goldChange || 0;

  if (branch.tokenMoves) {
    for (const mv of branch.tokenMoves) {
      await moveToken(roomId, mv.name, mv.newX, mv.newY, true);
    }
  }

  // ===== AoE resolution (circle / cone / line) =====
  // When the DM planned an area-of-effect spell, compute affected cells and
  // apply damage to every monster AND player (except the caster) inside them.
  // Each target rolls a saving throw: success = half damage, fail = full.
  let aoeResult: ResolutionResult["aoe"] = undefined;
  if (
    plan.aoeShape &&
    branch.monsterDamage?.notation &&
    plan.aoeOrigin &&
    typeof plan.aoeSize === "number"
  ) {
    const shape = plan.aoeShape;
    const aoeSize = Math.max(1, Math.min(8, plan.aoeSize));
    const origin = plan.aoeOrigin;
    const direction = plan.aoeDirection;
    const cells = computeAoECells(shape, aoeSize, origin, direction);
    const element = plan.aoeElement ?? "force";
    const saveDC = plan.saveDC ?? 12;
    const saveAbility = plan.saveAbility ?? "ТЕЛ";
    aoeResult = { shape, size: aoeSize, origin, cells, element, saveDC, saveAbility };

    // Gather all combatants in the affected cells (exclude the caster).
    const cellSet = new Set(cells.map((c) => `${c.x},${c.y}`));
    const allMonsters = await db.monster.findMany({ where: { roomId, isActive: true } });
    const allPlayers = await db.player.findMany({ where: { roomId } });
    const inAreaMonsters = allMonsters.filter((m) => cellSet.has(`${m.posX},${m.posY}`));
    const inAreaPlayers = allPlayers.filter(
      (p) => p.name !== actorName && p.hp > 0 && p.isAlive && cellSet.has(`${p.posX},${p.posY}`)
    );

    const damageNotation = branch.monsterDamage.notation;
    // Roll the spell damage once (the same base roll applies to all targets;
    // each target's save determines full vs half). Per D&D 5e, damage is
    // rolled once for the whole spell.
    const baseDmgRoll = rollDice(damageNotation);
    const baseDamage = baseDmgRoll.total;

    await logDiceRoll(roomId, round, actorName, {
      label: `Урон заклинания (${element})`,
      notation: damageNotation,
      modifier: 0,
      result: baseDmgRoll.raw,
      total: baseDamage,
      purpose: "player_damage",
    });

    // Helper: save bonus for a target based on the save ability.
    const saveBonusFor = (
      ability: string,
      target: { str: number; dex: number; con: number; int: number; wis: number; cha: number }
    ): number => {
      switch (ability) {
        case "СИЛ": return abilityModifier(target.str);
        case "ЛОВ": return abilityModifier(target.dex);
        case "ТЕЛ": return abilityModifier(target.con);
        case "ИНТ": return abilityModifier(target.int);
        case "МУД": return abilityModifier(target.wis);
        case "ХАР": return abilityModifier(target.cha);
        default: return 0;
      }
    };

    const aoeLog: string[] = [];

    // Monsters in area.
    for (const m of inAreaMonsters) {
      const saveBonus = 0; // monsters in this engine have no ability scores; flat +0.
      const saveRoll = rollD20(saveBonus);
      const saved = saveRoll.total >= saveDC;
      const dmg = saved ? Math.floor(baseDamage / 2) : baseDamage;
      const rr: ResolvedRoll = {
        label: `Спасбросок ${m.name} (${saveAbility})`,
        notation: "1d20",
        modifier: saveBonus,
        result: saveRoll.rolls[0],
        total: saveRoll.total,
        target: saveDC,
        success: saved,
        purpose: "monster_save",
      };
      playerRolls.push(rr);
      await logDiceRoll(roomId, round, m.name, rr);
      if (dmg > 0) {
        const r = await damageMonster(roomId, m.id, dmg);
        await logDiceRoll(roomId, round, actorName, {
          label: `Урон по ${m.name}${saved ? " (половина, спас)" : ""}`,
          notation: damageNotation,
          modifier: 0,
          result: dmg,
          total: dmg,
          purpose: "player_damage",
        });
        damageDealtToMonster += dmg;
        if (r.died) {
          if (!monsterThatDied) monsterThatDied = m.name;
          const xp = xpForMonster(m.maxHp);
          await awardXP(roomId, actorName, xp);
          aoeLog.push(`${m.name} повержен! (+${xp} опыта)`);
        } else {
          aoeLog.push(`${m.name}: ${dmg} урона${saved ? " (спас, половина)" : ""}.`);
        }
      }
    }

    // Players in area (allies caught in the blast).
    for (const p of inAreaPlayers) {
      const saveBonus = saveBonusFor(saveAbility, p);
      const saveRoll = rollD20(saveBonus);
      const saved = saveRoll.total >= saveDC;
      const dmg = saved ? Math.floor(baseDamage / 2) : baseDamage;
      const rr: ResolvedRoll = {
        label: `Спасбросок ${p.name} (${saveAbility})`,
        notation: "1d20",
        modifier: saveBonus,
        result: saveRoll.rolls[0],
        total: saveRoll.total,
        target: saveDC,
        success: saved,
        purpose: "player_save",
      };
      playerRolls.push(rr);
      await logDiceRoll(roomId, round, p.name, rr);
      if (dmg > 0) {
        const r = await damagePlayer(roomId, p.name, dmg);
        await logDiceRoll(roomId, round, actorName, {
          label: `Урон по ${p.name}${saved ? " (половина, спас)" : ""}`,
          notation: damageNotation,
          modifier: 0,
          result: dmg,
          total: dmg,
          purpose: "player_damage",
        });
        damageDealtToPlayer += dmg;
        if (!damagedPlayer) damagedPlayer = p.name;
        if (r.died) {
          aoeLog.push(`${p.name} пал в зоне заклинания!`);
        } else {
          aoeLog.push(`${p.name}: ${dmg} урона${saved ? " (спас, половина)" : ""}.`);
        }
      }
    }

    if (aoeLog.length > 0) {
      await db.chatMessage.create({
        data: {
          roomId,
          role: "system",
          speaker: "",
          round,
          content: `Область заклинания (${shape}, ${element}): ${aoeLog.join(" ")}`,
        },
      });
    }
  } else if (outcome === "success" && branch.monsterDamage) {
    // Single-target damage (non-AoE).
    const targetName = branch.monsterDamage.target;
    let m = await db.monster.findFirst({ where: { name: { contains: targetName }, roomId, isActive: true } });
    if (!m) m = await db.monster.findFirst({ where: { label: { contains: targetName }, roomId, isActive: true } });
    if (!m) {
      const near = await nearestActiveMonster(roomId, 0, 0);
      if (near) m = await db.monster.findFirst({ where: { id: near.monster.id, roomId } });
    }
    if (m) {
      const dmg = rollDice(branch.monsterDamage.notation);
      // Talent: bonus flat damage + vampiric heal.
      const bonus = damageBonusFromTalents(actor);
      const isCrit = playerRolls.some((r) => r.purpose === "СИЛ" || r.purpose === "action" || r.purpose === "ЛОВ")
        ? false : false; // crit handled via natural roll below
      void isCrit;
      damageDealtToMonster = dmg.total + bonus;
      await logDiceRoll(roomId, round, actorName, {
        label: `Урон по: ${m.name}` + (bonus ? ` (+${bonus} талант)` : ""),
        notation: branch.monsterDamage.notation + (bonus ? `+${bonus}` : ""),
        modifier: bonus, result: dmg.raw, total: damageDealtToMonster, purpose: "player_damage",
      });
      const result = await damageMonster(roomId, m.id, damageDealtToMonster);
      // Vampiric heal.
      const vampHeal = rollVampiricHeal(actor, damageDealtToMonster);
      if (vampHeal > 0) {
        await healPlayer(roomId, actorName, vampHeal);
        healingToPlayer += vampHeal;
        healedPlayer = actorName;
        await logDiceRoll(roomId, round, actorName, {
          label: "Вампиризм", notation: `${vampHeal}`, modifier: 0, result: vampHeal, total: vampHeal, purpose: "healing",
        });
      }
      if (result.died) {
        monsterThatDied = m.name;
        // Heal-on-kill talent.
        const killHeal = rollHealOnKill(actor);
        if (killHeal > 0) {
          await healPlayer(roomId, actorName, killHeal);
          healingToPlayer += killHeal;
          healedPlayer = actorName;
          await logDiceRoll(roomId, round, actorName, {
            label: "Лечение за убийство", notation: healOnKillNotation(actor) || `${killHeal}`, modifier: 0, result: killHeal, total: killHeal, purpose: "healing",
          });
        }
        // Award XP to the killing player.
        const xp = xpForMonster(m.maxHp);
        await awardXP(roomId, actorName, xp);
        await db.chatMessage.create({
          data: { roomId, role: "system", speaker: "", round, content: `${actorName} получает ${xp} опыта за победу над ${m.name}.` },
        });
      }
    }
  }

  if (branch.playerDamage) {
    let dmg = rollDice(branch.playerDamage.notation);
    let total = dmg.total;
    // Talent: damage reduction.
    total = applyDamageReduction(actor, total);
    damageDealtToPlayer = total;
    damagedPlayer = actorName; // failure backlash hits the actor
    await logDiceRoll(roomId, round, actorName, {
      label: "Урон по герою" + (total < dmg.total ? ` (−${dmg.total - total} сопр.)` : ""),
      notation: branch.playerDamage.notation, modifier: 0, result: dmg.raw, total, purpose: "player_damage",
    });
    await damagePlayer(roomId, actorName, total);
  }

  if (branch.healing) {
    const heal = rollDice(branch.healing.notation);
    healingToPlayer += heal.total;
    healedPlayer = branch.healing.target || actorName;
    await logDiceRoll(roomId, round, actorName, {
      label: "Лечение", notation: branch.healing.notation,
      modifier: 0, result: heal.raw, total: heal.total, purpose: "healing",
    });
    await healPlayer(roomId, healedPlayer, heal.total);
  }

  if (inventoryChanges.length > 0) {
    await applyInventoryChanges(roomId, actorName, inventoryChanges);
  }
  if (goldChange) {
    await adjustGold(roomId, actorName, goldChange);
  }

  // Apply conditions the DM planned for this outcome (success or failure).
  // Determine target type (player/monster) and write a system chat line.
  const plannedConditions: PlannedCondition[] = Array.isArray(branch.conditions) ? branch.conditions : [];
  let appliedConditionCount = 0;
  if (plannedConditions.length > 0) {
    const players = await db.player.findMany({ where: { roomId }, select: { name: true } });
    const monsters = await db.monster.findMany({ where: { roomId }, select: { name: true } });
    const playerNames = new Set(players.map((p) => p.name));
    const monsterNames = new Set(monsters.map((m) => m.name));
    for (const pc of plannedConditions) {
      if (!pc || !pc.target || !pc.type) continue;
      const targetType: "player" | "monster" = playerNames.has(pc.target) ? "player"
        : monsterNames.has(pc.target) ? "monster"
        : pc.target === actorName ? "player"
        : "monster";
      const applied = await applyCondition(roomId, pc.target, targetType, pc.type, pc.duration ?? 3, pc.source ?? actorName);
      if (applied) {
        appliedConditionCount++;
        const def = getCondition(applied.condition);
        const nameRu = def?.name ?? applied.condition;
        const icon = def?.icon ?? "❓";
        await db.chatMessage.create({
          data: {
            roomId, role: "system", speaker: "", round,
            content: `${pc.target} получает состояние: ${icon} ${nameRu} (${applied.duration} раундов).`,
          },
        });
      }
    }
  }

  // ===== Quest Journal =====
  // The DM may have planned a quest update (new active quest or status change).
  const plannedQuest = branch.quest ?? null;
  if (plannedQuest && plannedQuest.title && plannedQuest.status) {
    const title = String(plannedQuest.title).trim();
    const status = plannedQuest.status;
    if (status === "active") {
      // Avoid duplicate active quests with the same title.
      const existing = await db.quest.findFirst({ where: { roomId, title } });
      if (!existing) {
        const created = await createQuest(
          roomId,
          title,
          plannedQuest.description ?? "",
          plannedQuest.objectives ?? "",
          plannedQuest.reward ?? ""
        );
        if (created) {
          await db.chatMessage.create({
            data: {
              roomId, role: "system", speaker: "", round,
              content: `📜 Новый квест: «${created.title}».${created.objectives.length > 0 ? ` Цели: ${created.objectives.join(", ")}.` : ""}${created.reward ? ` Награда: ${created.reward}.` : ""}`,
            },
          });
        }
      }
    } else {
      // completed / failed — update the matching quest if it exists.
      const existing = await db.quest.findFirst({ where: { roomId, title } });
      if (existing) {
        await updateQuestStatus(roomId, existing.id, status);
        await db.chatMessage.create({
          data: {
            roomId, role: "system", speaker: "", round,
            content: `📜 Квест «${title}» — ${status === "completed" ? "выполнен!" : "провален."}`,
          },
        });
      }
    }
  }

  // ===== NPC upsert =====
  // The DM may have planned to introduce a new NPC in the room.
  const plannedNpc = branch.npc ?? null;
  if (plannedNpc && plannedNpc.name && plannedNpc.role) {
    const role = plannedNpc.role as "merchant" | "questgiver" | "ally" | "enemy";
    const disposition = (plannedNpc.disposition ?? "neutral") as "friendly" | "neutral" | "hostile";
    const npc = await upsertNpc(
      roomId,
      String(plannedNpc.name),
      role,
      disposition,
      plannedNpc.location ?? "",
      plannedNpc.notes ?? ""
    );
    if (npc) {
      await db.chatMessage.create({
        data: {
          roomId, role: "system", speaker: "", round,
          content: ` NPC: ${npc.name} [${role}, ${disposition}]${npc.location ? ` @ ${npc.location}` : ""}.`,
        },
      });
    }
  }

  return {
    playerRolls, outcome,
    damageDealtToMonster, monsterThatDied,
    damageDealtToPlayer, damagedPlayer,
    healingToPlayer, healedPlayer,
    inventoryChanges, goldChange,
    category: plan.category,
    imagePrompt: plan.imagePrompt, imageNeeded: plan.imageNeeded,
    branchNarrative: branch.narrative,
    appliedConditionCount,
    aoe: aoeResult,
  };
}

// ---------- monster turn ----------
interface MonsterTurnResult {
  taken: boolean;
  rolls: ResolvedRoll[];
  damageToPlayer: number;
  damagedPlayer: string | null;
  monsterName: string | null;
  moved: boolean;
  narrativeLine: string;
}

async function runMonsterTurn(roomId: string, round: number, monsterId: string): Promise<MonsterTurnResult> {
  const m = await db.monster.findFirst({ where: { id: monsterId, roomId } });
  if (!m) return emptyMonster();
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room) return emptyMonster();

  const nearest = await nearestActiveMonster(roomId, m.posX, m.posY); // not used; we want nearest player
  void nearest;
  const targetRes = await moveMonsterTowardNearestPlayer(roomId, m.id);
  const dist = targetRes.distAfter;
  const targetName: string = targetRes.targetName ?? "";

  const rolls: ResolvedRoll[] = [];

  // Not adjacent — move closer (already done), end turn.
  if (dist > 1) {
    return {
      taken: true, rolls, damageToPlayer: 0, damagedPlayer: null,
      monsterName: m.name, moved: true,
      narrativeLine: `${m.name} приближается к ${targetName || "героям"}.`,
    };
  }

  // Adjacent — attack the target.
  const target = await db.player.findFirst({ where: { name: targetName, roomId } });
  if (!target) return emptyMonster();

  // Build a PlayerState-like view for talent modifiers.
  const targetState: PlayerState = {
    id: target.id, name: target.name, charClass: target.charClass, level: target.level,
    hp: target.hp, maxHp: target.maxHp, ac: target.ac,
    str: target.str, dex: target.dex, con: target.con, int: target.int, wis: target.wis, cha: target.cha,
    proficiencyBonus: target.proficiencyBonus, gold: target.gold, posX: target.posX, posY: target.posY,
    color: target.color, weaponName: target.weaponName, weaponNotation: target.weaponNotation,
    portraitUrl: target.portraitUrl, isHost: target.isHost, isAlive: target.isAlive,
    race: target.race, raceName: target.raceName, background: target.background, backgroundName: target.backgroundName,
    xp: target.xp,
    selectedTalents: target.selectedTalents ? target.selectedTalents.split(",").filter(Boolean) : [],
    bonusStr: target.bonusStr, bonusDex: target.bonusDex, bonusCon: target.bonusCon,
    bonusInt: target.bonusInt, bonusWis: target.bonusWis, bonusCha: target.bonusCha,
    pendingLevelUp: target.pendingLevelUp,
    pendingASI: Boolean((target as any).pendingASI),
    spellSlots: parseSlotsSafe(target.spellSlots),
    maxSpellSlots: parseSlotsSafe(target.maxSpellSlots),
    hitDice: target.hitDice ?? 8,
    equipment: {
      weapon: (target as any).eqWeapon ?? null,
      shield: (target as any).eqShield ?? null,
      head: (target as any).eqHead ?? null,
      chest: (target as any).eqChest ?? null,
      legs: (target as any).eqLegs ?? null,
      hands: (target as any).eqHands ?? null,
      accessory1: (target as any).eqAccessory1 ?? null,
      accessory2: (target as any).eqAccessory2 ?? null,
    },
  };
  const targetAC = effectiveAC(targetState);

  const atk = rollD20(m.attackBonus);
  const hit = atk.total >= targetAC;
  rolls.push({
    label: `Атака ${m.name}`, notation: "1d20", modifier: m.attackBonus,
    result: atk.rolls[0], total: atk.total, target: targetAC, success: hit,
    purpose: "monster_attack",
  });
  await logDiceRoll(roomId, round, m.name, rolls[rolls.length - 1]);

  if (!hit) {
    return {
      taken: true, rolls, damageToPlayer: 0, damagedPlayer: null,
      monsterName: m.name, moved: false,
      narrativeLine: `${m.name} бьёт по ${targetName}, но промахивается (${atk.total} против AC ${targetAC}).`,
    };
  }

  const rawDmg = rollDice(m.damageNotation);
  // Talent: damage reduction.
  const dmg = applyDamageReduction(targetState, rawDmg.total);
  await logDiceRoll(roomId, round, m.name, {
    label: `Урон: ${m.name}` + (dmg < rawDmg.total ? ` (−${rawDmg.total - dmg} сопр.)` : ""),
    notation: m.damageNotation, modifier: 0, result: rawDmg.raw, total: dmg, purpose: "monster_damage",
  });
  await damagePlayer(roomId, targetName, dmg);

  // Talent: counterattack — the target may strike back.
  const counterDmg = rollCounterattack(targetState);
  let counterLine = "";
  if (counterDmg > 0) {
    const monsterResult = await damageMonster(roomId, m.id, counterDmg);
    await logDiceRoll(roomId, round, targetName, {
      label: `Контратака ${targetName}`, notation: "талант",
      modifier: 0, result: counterDmg, total: counterDmg, purpose: "player_damage",
    });
    counterLine = ` ${targetName} отвечает контратакой (${counterDmg} урона)!`;
    if (monsterResult.died) {
      const xp = xpForMonster(m.maxHp);
      await awardXP(roomId, targetName, xp);
      await db.chatMessage.create({
        data: { roomId, role: "system", speaker: "", round, content: `${targetName} получает ${xp} опыта за победу над ${m.name}.` },
      });
    }
  }

  return {
    taken: true, rolls, damageToPlayer: dmg, damagedPlayer: targetName,
    monsterName: m.name, moved: false,
    narrativeLine: `${m.name} бьёт ${targetName} и попадает! ${dmg} урона (${atk.total} против AC ${targetAC}).${counterLine}`,
  };
}

function emptyMonster(): MonsterTurnResult {
  return { taken: false, rolls: [], damageToPlayer: 0, damagedPlayer: null, monsterName: null, moved: false, narrativeLine: "" };
}

// ---------- turn advancement ----------
async function advanceTurn(roomCode: string, roomId: string): Promise<{
  ended: boolean;
  monsterTurns: { name: string; narrative: string; result: MonsterTurnResult }[];
  nextTurnName: string | null;
  nextTurnType: "player" | "monster" | null;
}> {
  const monsterTurns: { name: string; narrative: string; result: MonsterTurnResult }[] = [];
  const room = await db.room.findUnique({ where: { id: roomId } });
  if (!room || !room.combatActive) {
    return { ended: false, monsterTurns, nextTurnName: null, nextTurnType: null };
  }

  let order = await db.initiativeEntry.findMany({ where: { roomId }, orderBy: { order: "asc" } });
  if (order.length === 0) {
    return { ended: true, monsterTurns, nextTurnName: null, nextTurnType: null };
  }

  // Loop: advance turnIndex, run monster turns until a living player is up.
  let safety = 0;
  while (safety++ < 50) {
    let nextIndex = room.turnIndex + 1;
    let round = room.round;
    let roundAdvanced = false;
    if (nextIndex >= order.length) {
      nextIndex = 0;
      round += 1;
      roundAdvanced = true;
    }
    await setRoomState(roomId, { turnIndex: nextIndex, round });
    // re-read room + order
    const room2 = await db.room.findUnique({ where: { id: roomId } });
    if (!room2) break;
    room.turnIndex = room2.turnIndex;
    room.round = room2.round;
    order = await db.initiativeEntry.findMany({ where: { roomId }, orderBy: { order: "asc" } });
    // At the start of a new round, tick all conditions (decrement durations,
    // apply per-round damage like burning, remove expired).
    if (roundAdvanced) {
      const tickMessages = await tickConditions(roomId);
      for (const msg of tickMessages) {
        await db.chatMessage.create({
          data: { roomId, role: "system", speaker: "", round, content: msg },
        });
      }
    }
    const current = order[room.turnIndex];
    if (!current) {
      return { ended: true, monsterTurns, nextTurnName: null, nextTurnType: null };
    }

    // Combat end checks.
    const alive = await countAlive(roomId);
    if (!alive.anyMonsterAlive || !alive.anyPlayerAlive) {
      await setRoomState(roomId, { combatActive: false });
      return { ended: true, monsterTurns, nextTurnName: null, nextTurnType: null };
    }

    if (current.combatantType === "player") {
      // Skip dead players.
      const p = await db.player.findFirst({ where: { name: current.combatantName, roomId } });
      if (!p || p.hp <= 0 || !p.isAlive) {
        // mark entry dead, continue advancing
        await db.initiativeEntry.updateMany({ where: { id: current.id }, data: { isAlive: false } });
        continue;
      }
      return { ended: false, monsterTurns, nextTurnName: current.combatantName, nextTurnType: "player" };
    }

    // Monster turn.
    const monster = await db.monster.findFirst({ where: { name: current.combatantName, roomId } });
    if (!monster || !monster.isActive || monster.hp <= 0) {
      await db.initiativeEntry.updateMany({ where: { id: current.id }, data: { isAlive: false } });
      continue;
    }
    const result = await runMonsterTurn(roomId, room.round, monster.id);
    if (result.taken) {
      const snap = await getSnapshot(roomCode);
      const narrative = await narrateMonsterTurn(roomCode, {
        monsterName: result.monsterName!,
        moved: result.moved,
        targetName: result.damagedPlayer ?? null,
        hit: result.damageToPlayer > 0 ? true : result.narrativeLine.includes("промах") ? false : (result.moved ? null : false),
        damage: result.damageToPlayer,
        attackTotal: result.rolls[0]?.total ?? null,
        ac: result.rolls[0]?.target ?? null,
        location: snap?.location ?? "",
      });
      await db.chatMessage.create({
        data: { roomId, role: "dm", speaker: "", round: room.round, content: narrative },
      });
      monsterTurns.push({ name: result.monsterName!, narrative, result });
    }
    // Check combat end after monster turn.
    const alive2 = await countAlive(roomId);
    if (!alive2.anyMonsterAlive || !alive2.anyPlayerAlive) {
      await setRoomState(roomId, { combatActive: false });
      return { ended: true, monsterTurns, nextTurnName: null, nextTurnType: null };
    }
  }
  return { ended: false, monsterTurns, nextTurnName: null, nextTurnType: null };
}

// ---------- main entry ----------
export interface MechanicsResult extends Omit<ResolvedEvent, "finalNarrative"> {
  branchNarrative: string;
  playerAction: string;
  location: string;
}

/** Resolve all mechanics (plan, dice, effects, monster turns) WITHOUT the
 *  final narrative. Returns everything the SSE route needs to then stream
 *  the narrative token-by-token. */
export async function resolvePlayerMechanics(
  roomCode: string,
  actorName: string,
  playerAction: string
): Promise<MechanicsResult> {
  const room = await db.room.findUnique({ where: { code: roomCode.toUpperCase() } });
  if (!room) throw new Error("Комната не найдена.");
  const roomId = room.id;

  const actor = await db.player.findFirst({ where: { name: actorName, roomId } });
  if (!actor) throw new Error("Герой не найден в комнате.");
  if (!actor.isAlive || actor.hp <= 0) throw new Error("Павший герой не может действовать.");

  const wasCombatActive = room.combatActive;
  const round = room.round;

  // Turn enforcement.
  if (wasCombatActive) {
    // In combat: must be the actor's initiative turn.
    const order = await db.initiativeEntry.findMany({ where: { roomId }, orderBy: { order: "asc" } });
    const current = order[room.turnIndex];
    if (!current || current.combatantName !== actorName || current.combatantType !== "player") {
      throw new Error("Сейчас не ваш ход. Дождитесь своей инициативы.");
    }
  } else {
    // Exploration: must be the actor's exploration turn.
    const players = await db.player.findMany({ where: { roomId }, orderBy: { createdAt: "asc" } });
    const alive = players.filter((p) => p.isAlive && p.hp > 0);
    if (alive.length > 1) {
      const current = alive[room.explorationActorIndex % alive.length];
      if (!current || current.name !== actorName) {
        throw new Error(`Сейчас ход: ${current?.name ?? "?"}. Дождитесь своей очереди.`);
      }
    }
  }

  // 1. Plan the mechanics first.
  const plan = await planResolution(roomCode, actorName, playerAction);

  // Spell-slot detection: if the action text mentions a slot-consuming
  // ability for the actor's class, try to spend a spell slot. If none remain,
  // override the plan as invalid.
  if (plan.category !== "invalid") {
    const classId = getClassIdByCharClass(actor.charClass);
    const isCaster = isCasterClass(classId);
    const slotAbilities = SLOT_CONSUMING_ABILITIES[classId] ?? [];
    const actionLower = playerAction.toLowerCase();
    const usedSlotAbility =
      isCaster && slotAbilities.some((name) => actionLower.includes(name.toLowerCase()));
    if (usedSlotAbility) {
      const spend = await spendSpellSlot(roomId, actorName, 1);
      if (!spend.ok) {
        plan.category = "invalid";
        plan.invalidReason =
          "Закончились ячейки заклинаний. Отдохните, чтобы восстановить их.";
      } else {
        // Log the spent slot so it shows up in the dice log.
        await logDiceRoll(roomId, round, actorName, {
          label: `Ячейка заклинания ур.${spend.level}`,
          notation: "slot",
          modifier: 0,
          result: spend.level,
          total: spend.level,
          purpose: "spell_slot",
        });
      }
    }
  }

  // INVALID action: the DM rejected it as impossible. Do NOT consume the turn,
  // do NOT apply effects — just narrate the rejection.
  if (plan.category === "invalid") {
    const reason = plan.invalidReason || "Это действие невозможно в данных обстоятельствах.";
    await db.chatMessage.create({ data: { roomId, role: "player", speaker: actorName, round, content: playerAction } });
    await db.chatMessage.create({ data: { roomId, role: "dm", speaker: "", round, content: reason } });
    const snap = await getSnapshot(roomCode);
    return {
      actorName,
      playerRolls: [],
      monsterRolls: [],
      outcome: "failure",
      combatStarted: false,
      combatEnded: false,
      damageDealtToMonster: 0,
      monsterThatDied: null,
      damageDealtToPlayer: 0,
      damagedPlayer: null,
      healingToPlayer: 0,
      healedPlayer: null,
      inventoryChanges: [],
      goldChange: 0,
      imagePrompt: "",
      imageNeeded: false,
      branchNarrative: reason,
      playerAction,
      location: snap?.location ?? "",
      nextTurn: wasCombatActive ? null : actorName, // turn NOT advanced for invalid actions
      nextTurnType: wasCombatActive ? null : "player",
      round,
    };
  }

  // If this is the opening combat action, reveal hidden monsters so the
  // attack can actually hit them.
  let combatStarted = false;
  if (!wasCombatActive && plan.category === "combat") {
    await db.monster.updateMany({ where: { roomId, isActive: false }, data: { isActive: true } });
  }

  // 2. Resolve the player's action with the pre-computed plan (no monster turn).
  const res = await resolvePlayerAction(roomCode, roomId, actorName, playerAction, round, plan);
  let combatEnded = false;

  // 3. If the action triggered combat, roll initiative (monsters already active).
  if (!wasCombatActive && res.category === "combat") {
    await rollInitiative(roomId);
    await setRoomState(roomId, { combatActive: true, round: 1, turnIndex: 0 });
    combatStarted = true;
  }

  // Snapshot for location (narrative will be streamed by the route).
  const snap1 = await getSnapshot(roomCode);

  // Persist the player's message immediately (DM narrative is saved by the route after streaming).
  await db.chatMessage.create({ data: { roomId, role: "player", speaker: actorName, round, content: playerAction } });

  // 4. Check immediate combat end (e.g. one-shot kill before initiative, or last monster died).
  const aliveCheck = await countAlive(roomId);
  if (combatStarted && (!aliveCheck.anyMonsterAlive || !aliveCheck.anyPlayerAlive)) {
    await setRoomState(roomId, { combatActive: false });
    combatEnded = true;
  }
  // Also if already in combat and the player's action ended it.
  if (wasCombatActive && !aliveCheck.anyMonsterAlive) {
    await setRoomState(roomId, { combatActive: false });
    combatEnded = true;
  }

  // 5. Advance turn (run monster turns until a player is up), unless combat just ended.
  let nextTurnName: string | null = null;
  let nextTurnType: "player" | "monster" | null = null;
  let monsterRolls: ResolvedRoll[] = [];

  if (combatStarted && !combatEnded) {
    // After a combat-triggering opening strike: advance from turnIndex 0.
    // If order[0] is the actor (who just acted), skip to the next combatant.
    const order = await db.initiativeEntry.findMany({ where: { roomId }, orderBy: { order: "asc" } });
    const first = order[0];
    if (first && first.combatantName === actorName && first.combatantType === "player") {
      // The actor already acted (opening strike) — advance once.
      const adv = await advanceTurn(roomCode, roomId);
      if (adv.ended) combatEnded = true;
      nextTurnName = adv.nextTurnName;
      nextTurnType = adv.nextTurnType;
      for (const mt of adv.monsterTurns) monsterRolls.push(...mt.result.rolls);
    } else {
      // Start from turnIndex 0. If it's a monster, run monster turns.
      const adv = await advanceTurn(roomCode, roomId);
      if (adv.ended) combatEnded = true;
      nextTurnName = adv.nextTurnName;
      nextTurnType = adv.nextTurnType;
      for (const mt of adv.monsterTurns) monsterRolls.push(...mt.result.rolls);
      // If next is a player, that's whose turn it is now.
    }
  } else if (wasCombatActive && !combatEnded) {
    // Normal in-combat advance after the player's turn.
    const adv = await advanceTurn(roomCode, roomId);
    if (adv.ended) combatEnded = true;
    nextTurnName = adv.nextTurnName;
    nextTurnType = adv.nextTurnType;
    for (const mt of adv.monsterTurns) monsterRolls.push(...mt.result.rolls);
  } else if (!wasCombatActive) {
    // Exploration: advance to the next alive player.
    await advanceExplorationTurn(roomId, actorName);
    const snap2 = await getSnapshot(roomCode);
    nextTurnName = snap2?.currentExplorerName ?? null;
    nextTurnType = nextTurnName ? "player" : null;
  }

  // Final snapshot for round reporting.
  const finalRoom = await db.room.findUnique({ where: { id: roomId } });

  return {
    actorName: actorName,
    playerRolls: res.playerRolls,
    monsterRolls,
    outcome: res.outcome,
    combatStarted,
    combatEnded,
    damageDealtToMonster: res.damageDealtToMonster,
    monsterThatDied: res.monsterThatDied,
    damageDealtToPlayer: res.damageDealtToPlayer,
    damagedPlayer: res.damagedPlayer,
    healingToPlayer: res.healingToPlayer,
    healedPlayer: res.healedPlayer,
    inventoryChanges: res.inventoryChanges,
    goldChange: res.goldChange,
    imagePrompt: res.imagePrompt,
    imageNeeded: res.imageNeeded,
    branchNarrative: res.branchNarrative,
    playerAction,
    location: snap1?.location ?? "",
    nextTurn: nextTurnName,
    nextTurnType,
    round: finalRoom?.round ?? round,
    aoe: res.aoe,
  };
}

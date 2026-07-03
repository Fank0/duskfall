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
} from "./state";
import { rollDice, rollD20, abilityModifier } from "./dice";
import { extractJson } from "./json";
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
} from "./types";


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

ВЫВОД: только валидный JSON без пояснений, по схеме:
{
  "category": "combat|exploration|social|ability_check|invalid|other",
  "invalidReason": "короткое объяснение на русском почему действие невозможно (только если category=invalid, иначе пустая строка)",
  "rolls": [ { "label": "...", "notation": "1d20", "modifier": 5, "target": 13, "target_type": "AC", "ability": "СИЛ" } ],
  "success": {
    "narrative": "что происходит при успехе (2-3 предложения, без цифр урона)",
    "monsterDamage": { "notation": "1d8+3", "target": "Гоблин-разведчик" },
    "playerDamage": null, "healing": null,
    "inventory": [ { "action": "add", "item": "Название", "type": "potion", "description": "..." } ],
    "tokenMoves": [ { "name": "Имя героя", "newX": 2, "newY": 7 } ],
    "monsterDies": false, "goldChange": 0, "sceneChange": false
  },
  "failure": {
    "narrative": "...", "monsterDamage": null,
    "playerDamage": { "notation": "1d6+2" }, "healing": null,
    "inventory": [], "tokenMoves": [], "monsterDies": false, "goldChange": 0, "sceneChange": false
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
  const playerRolls: ResolvedRoll[] = [];
  let outcome: "success" | "failure" = "success";
  if (plan.rolls.length > 0) {
    for (const r of plan.rolls) {
      const res = rollDice(r.notation, r.modifier);
      const success = r.target_type === "none" ? true : res.total >= r.target;
      const rr: ResolvedRoll = {
        label: r.label, notation: r.notation, modifier: r.modifier,
        result: res.raw, total: res.total,
        target: r.target_type === "none" ? undefined : r.target,
        success, purpose: r.ability || "action",
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

  if (outcome === "success" && branch.monsterDamage) {
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
      const bonus = damageBonusFromTalents(actorState);
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
      const vampHeal = rollVampiricHeal(actorState, damageDealtToMonster);
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
        const killHeal = rollHealOnKill(actorState);
        if (killHeal > 0) {
          await healPlayer(roomId, actorName, killHeal);
          healingToPlayer += killHeal;
          healedPlayer = actorName;
          await logDiceRoll(roomId, round, actorName, {
            label: "Лечение за убийство", notation: healOnKillNotation(actorState) || `${killHeal}`, modifier: 0, result: killHeal, total: killHeal, purpose: "healing",
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
    total = applyDamageReduction(actorState, total);
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

  return {
    playerRolls, outcome,
    damageDealtToMonster, monsterThatDied,
    damageDealtToPlayer, damagedPlayer,
    healingToPlayer, healedPlayer,
    inventoryChanges, goldChange,
    category: plan.category,
    imagePrompt: plan.imagePrompt, imageNeeded: plan.imageNeeded,
    branchNarrative: branch.narrative,
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
  const targetName = targetRes.targetName;

  const rolls: ResolvedRoll[] = [];

  // Not adjacent — move closer (already done), end turn.
  if (dist > 1) {
    return {
      taken: true, rolls, damageToPlayer: 0, damagedPlayer: null,
      monsterName: m.name, moved: true,
      narrativeLine: `${m.name} приближается к ${targetName}.`,
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
    if (nextIndex >= order.length) {
      nextIndex = 0;
      round += 1;
    }
    await setRoomState(roomId, { turnIndex: nextIndex, round });
    // re-read room + order
    const room2 = await db.room.findUnique({ where: { id: roomId } });
    if (!room2) break;
    room.turnIndex = room2.turnIndex;
    room.round = room2.round;
    order = await db.initiativeEntry.findMany({ where: { roomId }, orderBy: { order: "asc" } });
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
  };
}

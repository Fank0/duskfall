// The AI Dungeon Master agent.
//
// Decision loop (per player action):
//   1. Analyze action + fetch game context from the DB.
//   2. Ask the LLM (call #1) to plan the mechanics: rolls, DC, effects.
//   3. Roll the dice (backend, fair RNG).
//   4. Resolve the outcome and apply state changes (HP, inventory, grid).
//   5. Run the monster turn deterministically if combat is active.
//   6. Ask the LLM (call #2) to narrate the resolved round in Russian.
//   7. Return the resolved event + image prompt for visualisation.

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import {
  getDMContext,
  getSnapshot,
  logDiceRoll,
  damageMonster,
  damagePlayer,
  healPlayer,
  moveToken,
  moveMonsterTowardPlayer,
  applyInventoryChanges,
  adjustGold,
  setGameState,
  nearestActiveMonster,
  GRID_SIZE,
  PLAYER_NAME,
} from "./state";
import { rollDice, rollD20, abilityModifier } from "./dice";
import { extractJson } from "./json";
import type {
  DMResolution,
  ResolvedRoll,
  ResolvedEvent,
  InventoryChange,
} from "./types";

let zaiPromise: Promise<any> | null = null;
async function getZAI() {
  if (!zaiPromise) zaiPromise = ZAI.create();
  return zaiPromise;
}

const SYSTEM_PROMPT_PLANNING = `Ты — Мастер Подземелий для D&D 5e, ведущий тёмное фэнтези-приключение. Твоя задача — спланировать механику разрешения действия игрока.

ПРАВИЛА:
- Уровень игрока 1-3. Враги имеют 10-15 HP, наносят 1d6+2 урона.
- Артефакты должны иметь недостаток, соразмерный силе.
- Не давай игроку больше 50 золотых за сессию.
- Используй модификаторы характеристик: СИЛ, ЛОВ, ТЕЛ, ИНТ, МУД, ХАР (мод = (характеристика-10)/2).
- Бонус атаки ближнего боя = мод СИЛ + бонус мастерства.
- Бонус атаки дальнего боя = мод ЛОВ + бонус мастерства.
- Если действие требует проверки характеристики, rolls = [{notation:"1d20", modifier:<мод+бонус мастерости если proficiency>, target:<DC>, target_type:"DC", ability:"<ХАР>"}].
- Если это атака по противнику, rolls = [{notation:"1d20", modifier:<бонус атаки>, target:<AC противника>, target_type:"AC"}].
- DC для лёгких задач 8-10, средних 12-14, сложных 15-18, очень сложных 19-22.
- Если действие не требует броска (просто разговор, осмотр без риска), оставь rolls пустым массивом и считай успех автоматическим (используй ветку success).

ВЫВОД: только валидный JSON без пояснений, строго по схеме:
{
  "category": "combat|exploration|social|ability_check|other",
  "rolls": [
    { "label": "краткое описание броска", "notation": "1d20", "modifier": 5, "target": 13, "target_type": "AC", "ability": "СИЛ" }
  ],
  "success": {
    "narrative": "короткое описание того, что происходит при успехе (2-3 предложения, без конкретных цифр урона)",
    "monsterDamage": { "notation": "1d8+3", "target": "имя монстра" },
    "playerDamage": null,
    "healing": null,
    "inventory": [ { "action": "add", "item": "Название", "type": "weapon|armor|potion|misc|key", "description": "описание" } ],
    "tokenMoves": [ { "name": "Алдрик", "newX": 2, "newY": 7 } ],
    "monsterDies": false,
    "goldChange": 0,
    "sceneChange": false
  },
  "failure": {
    "narrative": "что происходит при провале (2-3 предложения)",
    "monsterDamage": null,
    "playerDamage": { "notation": "1d6+2" },
    "healing": null,
    "inventory": [],
    "tokenMoves": [],
    "monsterDies": false,
    "goldChange": 0,
    "sceneChange": false
  },
  "imagePrompt": "английское описание сцены для генерации тёмного фэнтези арта, подробно",
  "imageNeeded": true
}

ВАЖНО:
- Если игрок инициирует бой (атакует, бросается на врага), category = "combat".
- В success.monsterDamage.target указывай ТОЧНОЕ имя противника из контекста (например "Гоблин-разведчик"). Используй реальный AC противника из контекста как target в rolls.
- В success.monsterDamage.notation указывай урон оружия игрока (длинный меч = 1d8+3).
- В failure.playerDamage указывай урон контратаки врага если уместно.
- Если в контексте есть "Скрытые угрозы", игрок может атаковать их — тогда бой начнётся автоматически.
- tokenMoves двигай ТОЛЬКО игрока (монстров двигает система).
- Координаты сетки от 0 до 9.
- Пиши narrative на русском, тёмное фэнтези, атмосферно.`;

const SYSTEM_PROMPT_NARRATION = `Ты — Мастер Подземелий для D&D 5e. Напиши насыщенное, атмосферное повествование на РУССКОМ языке в стиле тёмного фэнтези (3-6 предложений) для разрешённого раунда. Вплети реальные результаты бросков и урона. Опиши действия и игрока, и монстров. Не используй markdown, только текст. Не повторяйся. Будь кинематографичен.`;

/** Call #1 — plan the mechanics for the player's action. */
async function planResolution(
  playerAction: string,
  context: string
): Promise<DMResolution> {
  const zai = await getZAI();
  const userMsg = `КОНТЕКСТ ИГРЫ:\n${context}\n\nДЕЙСТВИЕ ИГРОКА: ${playerAction}\n\nСпланируй механику разрешения. Верни только JSON.`;
  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: SYSTEM_PROMPT_PLANNING },
        { role: "user", content: userMsg },
      ],
      thinking: { type: "disabled" },
    });
    const raw = completion.choices[0]?.message?.content ?? "";
    const parsed = extractJson<DMResolution>(raw);
    if (parsed && parsed.success && parsed.failure) {
      return parsed;
    }
  } catch (e) {
    console.error("[DM] planResolution error:", e);
  }
  // Fallback: a simple ability check vs DC 12.
  return fallbackResolution(playerAction);
}

function fallbackResolution(playerAction: string): DMResolution {
  return {
    category: "ability_check",
    rolls: [
      {
        label: "Проверка",
        notation: "1d20",
        modifier: 2,
        target: 12,
        target_type: "DC",
        ability: "СИЛ",
      },
    ],
    success: {
      narrative:
        "Твои усилия увенчались успехом — обстоятельства складываются в твою пользу, и ты продвигаешься вперёд.",
      monsterDamage: null,
      playerDamage: null,
      healing: null,
      inventory: [],
      tokenMoves: [],
      monsterDies: false,
      goldChange: 0,
      sceneChange: false,
    },
    failure: {
      narrative:
        "Удача отворачивается от тебя — замысел не удаётся, и приходится искать иной путь.",
      monsterDamage: null,
      playerDamage: null,
      healing: null,
      inventory: [],
      tokenMoves: [],
      monsterDies: false,
      goldChange: 0,
      sceneChange: false,
    },
    imagePrompt:
      "Dark fantasy scene, misty forest, torchlight, ominous atmosphere, painterly concept art",
    imageNeeded: false,
  };
}

interface MonsterTurnResult {
  taken: boolean;
  rolls: ResolvedRoll[];
  damageToPlayer: number;
  monsterName: string | null;
  moved: boolean;
  narrativeLine: string;
}

/** Run the nearest monster's turn deterministically. */
async function runMonsterTurn(round: number): Promise<MonsterTurnResult> {
  const monster = await nearestActiveMonster();
  if (!monster) {
    return {
      taken: false,
      rolls: [],
      damageToPlayer: 0,
      monsterName: null,
      moved: false,
      narrativeLine: "",
    };
  }
  const snap = await getSnapshot();
  const player = snap.player;
  const dist = Math.max(
    Math.abs(monster.posX - player.posX),
    Math.abs(monster.posY - player.posY)
  );

  const rolls: ResolvedRoll[] = [];

  // If not adjacent, move closer (up to 2 cells = 30 ft).
  if (dist > 1) {
    await moveMonsterTowardPlayer(monster.id);
    return {
      taken: true,
      rolls,
      damageToPlayer: 0,
      monsterName: monster.name,
      moved: true,
      narrativeLine: `${monster.name} (${monster.label}) с рыком бросается вперёд, сокращая дистанцию до тебя.`,
    };
  }

  // Adjacent — attack!
  const atk = rollD20(monster.attackBonus);
  const hit = atk.total >= player.ac;
  rolls.push({
    label: `Атака ${monster.name}`,
    notation: "1d20",
    modifier: monster.attackBonus,
    result: atk.rolls[0],
    total: atk.total,
    target: player.ac,
    success: hit,
    purpose: "monster_attack",
  });
  await logDiceRoll(round, rolls[rolls.length - 1]);

  if (!hit) {
    return {
      taken: true,
      rolls,
      damageToPlayer: 0,
      monsterName: monster.name,
      moved: false,
      narrativeLine: `${monster.name} (${monster.label}) замахивается, но ты уворачиваешься — удар проходит мимо (атака ${atk.total} против AC ${player.ac}).`,
    };
  }

  const dmg = rollDice(monster.damageNotation);
  const dmgTotal = dmg.total;
  await logDiceRoll(round, {
    label: `Урон: ${monster.name}`,
    notation: monster.damageNotation,
    modifier: 0,
    result: dmg.raw,
    total: dmgTotal,
    purpose: "monster_damage",
  });
  await damagePlayer(dmgTotal);
  return {
    taken: true,
    rolls,
    damageToPlayer: dmgTotal,
    monsterName: monster.name,
    moved: false,
    narrativeLine: `${monster.name} (${monster.label}) бьёт и попадает! Ты получаешь ${dmgTotal} урона (атака ${atk.total}, урон ${monster.damageNotation} = ${dmgTotal}).`,
  };
}

/** Call #2 — narrate the full resolved round in Russian. */
async function narrateRound(
  playerAction: string,
  resolved: {
    playerRolls: ResolvedRoll[];
    outcome: "success" | "failure";
    branchNarrative: string;
    damageToMonster: number;
    monsterThatDied: string | null;
    inventoryChanges: InventoryChange[];
    goldChange: number;
    monsterTurn: MonsterTurnResult;
    location: string;
  }
): Promise<string> {
  const zai = await getZAI();
  const lines: string[] = [];
  lines.push(`Локация: ${resolved.location}`);
  lines.push(`Действие игрока: ${playerAction}`);
  lines.push(`Исход: ${resolved.outcome === "success" ? "УСПЕХ" : "ПРОВАЛ"}`);
  if (resolved.playerRolls.length > 0) {
    lines.push("Броски игрока:");
    for (const r of resolved.playerRolls) {
      lines.push(
        `- ${r.label}: ${r.notation}${r.modifier >= 0 ? "+" : ""}${r.modifier} = ${r.total} (выпало ${r.result})${r.target ? `, цель ${r.target}` : ""} → ${r.success ? "успех" : "провал"}`
      );
    }
  }
  if (resolved.damageToMonster > 0) {
    lines.push(`Урон противнику: ${resolved.damageToMonster}`);
  }
  if (resolved.monsterThatDied) {
    lines.push(`Повержен: ${resolved.monsterThatDied}`);
  }
  if (resolved.inventoryChanges.length > 0) {
    lines.push(
      "Изменения инвентаря: " +
        resolved.inventoryChanges
          .map((c) => `${c.action === "add" ? "+" : "-"}${c.item}`)
          .join(", ")
    );
  }
  if (resolved.goldChange) {
    lines.push(`Золото: ${resolved.goldChange > 0 ? "+" : ""}${resolved.goldChange}`);
  }
  if (resolved.monsterTurn.taken && resolved.monsterTurn.monsterName) {
    lines.push(`Ход монстра (${resolved.monsterTurn.monsterName}):`);
    if (resolved.monsterTurn.moved) {
      lines.push("- монстр приближается к игроку");
    } else if (resolved.monsterTurn.damageToPlayer > 0) {
      lines.push(`- атака попадает, игрок получает ${resolved.monsterTurn.damageToPlayer} урона`);
    } else {
      lines.push("- атака промахивается");
    }
    for (const r of resolved.monsterTurn.rolls) {
      lines.push(
        `- ${r.label}: ${r.notation}${r.modifier >= 0 ? "+" : ""}${r.modifier} = ${r.total}${r.target ? ` против AC ${r.target}` : ""} → ${r.success ? "попадание" : "промах"}`
      );
    }
  }
  lines.push(`Заготовка нарратива (используй как основу, но расширь и улучши): ${resolved.branchNarrative}`);

  const userMsg = `Напиши повествование для этого раунда:\n${lines.join("\n")}`;
  try {
    const completion = await zai.chat.completions.create({
      messages: [
        { role: "assistant", content: SYSTEM_PROMPT_NARRATION },
        { role: "user", content: userMsg },
      ],
      thinking: { type: "disabled" },
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (text && text.length > 20) return text;
  } catch (e) {
    console.error("[DM] narrateRound error:", e);
  }
  // Fallback: assemble from parts.
  const parts: string[] = [resolved.branchNarrative];
  if (resolved.monsterTurn.taken && resolved.monsterTurn.narrativeLine) {
    parts.push(resolved.monsterTurn.narrativeLine);
  }
  return parts.join(" ");
}

/** Main entry: process a player action and return the resolved event. */
export async function processPlayerAction(
  playerAction: string
): Promise<ResolvedEvent> {
  const context = await getDMContext();
  const snap0 = await getSnapshot();
  const round = snap0.round;

  // 1. Plan the mechanics.
  const plan = await planResolution(playerAction, context);

  // 2. Activate combat if the action is combat and goblins are hiding.
  let combatJustStarted = false;
  if (plan.category === "combat" && !snap0.combatActive) {
    await db.monster.updateMany({ where: { isActive: false }, data: { isActive: true } });
    await setGameState({ combatActive: true, round: 1, turn: "player" });
    combatJustStarted = true;
  }

  const playerRolls: ResolvedRoll[] = [];
  let outcome: "success" | "failure" = "success";

  // 3. Roll the planned dice.
  if (plan.rolls.length > 0) {
    for (const r of plan.rolls) {
      const res = rollDice(r.notation, r.modifier);
      const success =
        r.target_type === "none" ? true : res.total >= r.target;
      const rr: ResolvedRoll = {
        label: r.label,
        notation: r.notation,
        modifier: r.modifier,
        result: res.raw,
        total: res.total,
        target: r.target_type === "none" ? undefined : r.target,
        success,
        purpose: r.ability || "action",
      };
      playerRolls.push(rr);
      await logDiceRoll(round, rr);
    }
    // Overall outcome: all rolls must succeed (typical single-roll resolution).
    outcome = playerRolls.every((r) => r.success) ? "success" : "failure";
  } else {
    // No roll needed — automatic success.
    outcome = "success";
  }

  const branch = outcome === "success" ? plan.success : plan.failure;

  // 4. Apply effects from the chosen branch.
  let damageDealtToMonster = 0;
  let monsterThatDied: string | null = null;
  let healingToPlayer = 0;
  let damageDealtToPlayer = 0;
  const inventoryChanges: InventoryChange[] = branch.inventory || [];
  let goldChange = branch.goldChange || 0;

  if (branch.tokenMoves && branch.tokenMoves.length > 0) {
    for (const mv of branch.tokenMoves) {
      await moveToken(mv.name, mv.newX, mv.newY, mv.name === PLAYER_NAME);
    }
  }

  if (outcome === "success" && branch.monsterDamage) {
    const targetName = branch.monsterDamage.target;
    // Try to match by name first, then fall back to the nearest active monster.
    let m = await db.monster.findFirst({
      where: { name: { contains: targetName }, isActive: true },
    });
    if (!m) {
      m = await db.monster.findFirst({
        where: { label: { contains: targetName }, isActive: true },
      });
    }
    if (!m) {
      const nearest = await nearestActiveMonster();
      m = nearest
        ? await db.monster.findUnique({ where: { id: nearest.id } })
        : null;
    }
    if (m) {
      const dmg = rollDice(branch.monsterDamage.notation);
      damageDealtToMonster = dmg.total;
      await logDiceRoll(round, {
        label: `Урон по: ${m.name}`,
        notation: branch.monsterDamage.notation,
        modifier: 0,
        result: dmg.raw,
        total: dmg.total,
        purpose: "player_damage",
      });
      const result = await damageMonster(m.id, dmg.total);
      if (result.died) {
        monsterThatDied = m.name;
      }
    }
  }

  if (branch.playerDamage) {
    const dmg = rollDice(branch.playerDamage.notation);
    damageDealtToPlayer = dmg.total;
    await logDiceRoll(round, {
      label: "Урон по герою",
      notation: branch.playerDamage.notation,
      modifier: 0,
      result: dmg.raw,
      total: dmg.total,
      purpose: "player_damage",
    });
    await damagePlayer(dmg.total);
  }

  if (branch.healing) {
    const heal = rollDice(branch.healing.notation);
    healingToPlayer = heal.total;
    await logDiceRoll(round, {
      label: "Лечение",
      notation: branch.healing.notation,
      modifier: 0,
      result: heal.raw,
      total: heal.total,
      purpose: "healing",
    });
    await healPlayer(heal.total);
  }

  if (inventoryChanges.length > 0) {
    await applyInventoryChanges(inventoryChanges);
  }
  if (goldChange) {
    await adjustGold(goldChange);
  }

  // 5. Monster turn — only if combat is active, monsters are alive, the
  //    player is standing, and combat did not *just* start this action
  //    (the player gets the opening strike on the surprise round).
  const currentSnap = await getSnapshot();
  let monsterTurn: MonsterTurnResult = {
    taken: false,
    rolls: [],
    damageToPlayer: 0,
    monsterName: null,
    moved: false,
    narrativeLine: "",
  };
  const shouldMonsterAct =
    currentSnap.combatActive &&
    !combatJustStarted &&
    currentSnap.monsters.some((m) => m.isActive) &&
    currentSnap.player.hp > 0;
  if (shouldMonsterAct) {
    monsterTurn = await runMonsterTurn(round);
    damageDealtToPlayer += monsterTurn.damageToPlayer;
  }

  // Re-check deaths / combat end.
  const afterSnap = await getSnapshot();
  const aliveMonsters = afterSnap.monsters.filter((m) => m.isActive);
  if (afterSnap.combatActive && aliveMonsters.length === 0) {
    await setGameState({ combatActive: false, turn: "player" });
  } else if (afterSnap.combatActive) {
    await setGameState({ turn: "player" }); // back to player for next action
  }

  // 6. Narrate the full round.
  const finalNarrative = await narrateRound(playerAction, {
    playerRolls,
    outcome,
    branchNarrative: branch.narrative,
    damageToMonster: damageDealtToMonster,
    monsterThatDied,
    inventoryChanges,
    goldChange,
    monsterTurn,
    location: afterSnap.location,
  });

  // 7. Persist the DM narrative + player message.
  await db.chatMessage.create({
    data: { role: "player", content: playerAction, round },
  });
  await db.chatMessage.create({
    data: { role: "dm", content: finalNarrative, round },
  });

  // Advance round counter during combat.
  if (afterSnap.combatActive) {
    await setGameState({ round: round + 1 });
  }

  return {
    playerRolls,
    monsterRolls: monsterTurn.rolls,
    outcome,
    playerNarrative: branch.narrative,
    monsterTurnTaken: monsterTurn.taken,
    damageDealtToMonster,
    damageDealtToPlayer,
    healingToPlayer,
    monsterThatDied,
    inventoryChanges,
    goldChange,
    imagePrompt: plan.imagePrompt,
    imageNeeded: plan.imageNeeded,
    finalNarrative,
  };
}

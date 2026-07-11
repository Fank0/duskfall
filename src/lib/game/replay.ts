/**
 * D4 — Combat replay (BG3-inspired "Повторить ход").
 *
 * Reconstructs a chronological list of `TurnEvent`s for the most recent combat
 * round from the persisted `diceLog` + `chat` + current token positions. The
 * ReplayOverlay component on the client consumes this list and plays it back
 * sequentially (600ms between events) so the player can see what just happened.
 *
 * This module is pure / isomorphic — no DB imports, no side-effects. It only
 * depends on the shared `*State` types from `./types`. Safe to import from
 * both server (API routes) and client (page.tsx / overlay component).
 *
 * Reconstruction strategy
 * -----------------------
 * The DM agent persists every dice roll via `logDiceRoll` (state.ts), each
 * tagged with `roller` (combatant name), `round`, `label`, `notation`,
 * `result`, `total`, `success`. Labels follow stable Russian patterns emitted
 * by dm-agent.ts:
 *
 *   "Инициатива"                       — initiative roll (round 0, skipped)
 *   "Атака <monster><...>"             — d20 attack roll (player OR monster roller)
 *   "Доп. атака N/M по <monster>"      — Extra Attack roll (player)
 *   "Второе оружие (бонус-действие) по <monster>" — off-hand attack (player)
 *   "Урон по: <monster><...>"          — player's weapon damage to a monster
 *   "Урон доп. атаки по: <monster>..." — extra-attack damage (player)
 *   "Урон второго оружия по: <monster>..." — off-hand damage (player)
 *   "Урон: <monster><...>"             — monster's damage to a player
 *   "Урон по герою..."                 — backlash damage to the actor
 *   "Урон по <monster> (половина, спас)" — AoE spell damage to a monster
 *   "Урон по <player> (половина, спас)"  — AoE spell damage to a player
 *   "Урон заклинания (<element>)..."   — base AoE spell damage roll
 *   "Урон ловушки..."                  — trap damage
 *   "Лечение"                          — healing roll
 *   "Вампиризм"                        — vampire heal
 *   "Лечение за убийство"              — kill-heal talent
 *   "Скрытая атака (Nd6)"             — sneak-attack damage
 *   "Спасбросок <target> (<ability>)"  — saving throw
 *   "Контратака <target>"              — reaction counter-attack
 *   "Ячейка заклинания ур.N"           — spell-slot spend (no roll, skipped)
 *
 * Conditions don't have their own roll history; we recover them by scanning
 * the chat messages from the same round for the Russian condition past-tense
 * verbs the DM narrates ("отравлен", "оглушён", "ослеплён", etc.). This is
 * best-effort — misses are silent (no condition event emitted).
 *
 * Move events can't be reliably reconstructed (we don't persist previous
 * positions); we emit a single move event per chat line that clearly mentions
 * movement verbs, using the combatant's CURRENT position as both `from` and
 * `to` (a no-op visually, but the highlight + label still communicate "X
 * moved"). Most replay value comes from attacks/damage/spells/heals which ARE
 * reliable.
 */

import type {
  ChatMessageState,
  DiceRollState,
  MonsterState,
  PlayerState,
} from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One reconstructed beat of the most recent combat round. */
export type TurnEvent =
  | { type: "move"; actor: string; from: { x: number; y: number }; to: { x: number; y: number }; ts: number }
  | {
      type: "attack";
      actor: string;
      target: string;
      hit: boolean;
      damage?: number;
      damageType?: string;
      crit?: boolean;
      ts: number;
    }
  | {
      type: "spell";
      actor: string;
      spellName: string;
      targets: string[];
      damage?: number;
      damageType?: string;
      ts: number;
    }
  | { type: "damage"; target: string; amount: number; damageType: string; ts: number }
  | { type: "heal"; target: string; amount: number; ts: number }
  | { type: "condition"; target: string; condition: string; applied: boolean; ts: number };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse a DiceRollState.createdAt (ISO string) into a numeric timestamp. */
function tsOf(roll: DiceRollState): number {
  const t = Date.parse(roll.createdAt);
  return Number.isFinite(t) ? t : 0;
}

/** Sort a list of rolls chronologically (ascending by createdAt). */
function chronological<T extends { createdAt: string }>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const ta = Date.parse(a.createdAt);
    const tb = Date.parse(b.createdAt);
    return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
  });
}

/** Find a player or monster by name in the current snapshot lists. */
function findCombatant(
  name: string | null | undefined,
  players: PlayerState[],
  monsters: MonsterState[],
): { kind: "player" | "monster"; pos: { x: number; y: number } } | null {
  if (!name) return null;
  const p = players.find((x) => x.name === name);
  if (p) return { kind: "player", pos: { x: p.posX, y: p.posY } };
  const m = monsters.find((x) => x.name === name);
  if (m) return { kind: "monster", pos: { x: m.posX, y: m.posY } };
  return null;
}

/** Is this roll a d20 attack roll (not a save, not initiative)? */
function isD20Attack(roll: DiceRollState): boolean {
  if (roll.notation !== "1d20" && roll.notation !== "d20") return false;
  if (roll.label === "Инициатива") return false;
  if (roll.label.startsWith("Спасбросок")) return false;
  // "Атака ..." / "Доп. атака ..." / "Второе оружие ... по ..." all count.
  return (
    roll.label.startsWith("Атака") ||
    roll.label.startsWith("Доп. атака") ||
    roll.label.startsWith("Второе оружие")
  );
}

/** Is this roll a damage roll authored by a player on a monster?
 *  (Label starts with "Урон по: " — note the colon, distinct from "Урон по " w/o colon). */
function isPlayerDamageToMonster(roll: DiceRollState): boolean {
  return (
    roll.label.startsWith("Урон по: ") ||
    roll.label.startsWith("Урон доп. атаки по: ") ||
    roll.label.startsWith("Урон второго оружия по: ") ||
    roll.label.startsWith("Скрытая атака")
  );
}

/** Is this roll a monster's damage roll on a player?
 *  Pattern: "Урон: <monsterName><...>" (note the colon after Урон). */
function isMonsterDamageToPlayer(roll: DiceRollState): boolean {
  return roll.label.startsWith("Урон: ");
}

/** Is this an AoE spell damage roll? ("Урон по <name>..." without a colon —
 *  distinct from player weapon damage which uses a colon). */
function isAoeSpellDamage(roll: DiceRollState): boolean {
  // "Урон по <name> (половина, спас)" — no colon after "по".
  if (roll.label.startsWith("Урон по: ")) return false; // player weapon dmg
  if (roll.label.startsWith("Урон по ")) return true;
  return false;
}

/** Is this a spell base-damage roll ("Урон заклинания (fire) ...")? */
function isSpellBaseDamage(roll: DiceRollState): boolean {
  return roll.label.startsWith("Урон заклинания");
}

/** Is this a heal roll? */
function isHeal(roll: DiceRollState): boolean {
  return (
    roll.label === "Лечение" ||
    roll.label === "Вампиризм" ||
    roll.label === "Лечение за убийство"
  );
}

/** Is this a backlash / actor-self damage roll? ("Урон по герою...") */
function isActorDamage(roll: DiceRollState): boolean {
  return roll.label.startsWith("Урон по герою");
}

/** Extract a monster name from a player-attack label.
 *  "Атака Гоблин-стрелок (атака 1/2)" → "Гоблин-стрелок"
 *  "Доп. атака 2/3 по Гоблин-стрелок" → "Гоблин-стрелок"
 *  "Второе оружие (бонус-действие) по Гоблин-стрелок" → "Гоблин-стрелок" */
function extractMonsterFromAttackLabel(label: string, monsters: MonsterState[]): string | null {
  // Try each monster name — pick the longest match to avoid prefix collisions
  // (e.g. "Гоблин-стрелок" vs "Гоблин").
  let best: string | null = null;
  for (const m of monsters) {
    if (label.includes(m.name)) {
      if (!best || m.name.length > best.length) best = m.name;
    }
  }
  if (best) return best;
  // Fall back to parsing after "по " for the Доп./Второе patterns.
  const m = /по\s+([^(]+?)(\s*\(|$)/.exec(label);
  if (m) return m[1].trim();
  // "Атака <name>..." — take everything after "Атака " up to " (" or end.
  const m2 = /Атака\s+([^(]+?)(\s*\(|$)/.exec(label);
  if (m2) return m2[1].trim();
  return null;
}

/** Extract a monster name from "Урон: <monster>..." (monster attacking player). */
function extractMonsterFromMonsterDamageLabel(
  label: string,
  monsters: MonsterState[],
): string | null {
  // "Урон: Гоблин-стрелок (атака 1/2)" → "Гоблин-стрелок"
  let best: string | null = null;
  for (const m of monsters) {
    if (label.includes(m.name)) {
      if (!best || m.name.length > best.length) best = m.name;
    }
  }
  return best;
}

/** Extract target name from an AoE spell-damage label.
 *  "Урон по Гоблин-стрелок (половина, спас)" → "Гоблин-стрелок"
 *  "Урон по Мира (половина, спас)" → "Мира" */
function extractTargetFromAoeLabel(
  label: string,
  players: PlayerState[],
  monsters: MonsterState[],
): string | null {
  const m = /Урон по\s+([^(]+?)(\s*\(|$)/.exec(label);
  if (!m) return null;
  const name = m[1].trim();
  // Validate against known combatants to avoid garbage.
  if (players.some((p) => p.name === name)) return name;
  if (monsters.some((x) => x.name === name)) return name;
  // Fall back to longest matching combatant name.
  let best: string | null = null;
  for (const c of [...players, ...monsters]) {
    if (label.includes(c.name)) {
      if (!best || c.name.length > best.length) best = c.name;
    }
  }
  return best;
}

/** Extract the element name from a spell base-damage label.
 *  "Урон заклинания (fire) [3d8 — усиление]" → "fire" */
function extractElementFromSpellLabel(label: string): string | undefined {
  const m = /Урон заклинания\s*\(([^)]+)\)/.exec(label);
  return m ? m[1].trim().toLowerCase() : undefined;
}

/** Infer a Russian spell name from chat content (best-effort). Returns the
 *  first well-known spell name found in the text, or null. */
const SPELL_NAMES_RU = [
  "Огненный шар",
  "Огненная стрела",
  "Магическая стрела",
  "Магический снаряд",
  "Ледяной шторм",
  "Конус холода",
  "Стена огня",
  "Цепная молния",
  "Молния",
  "Шокирование",
  "Ядовитое облако",
  "Кислотный шар",
  "Звёздный свет",
  "Лечение ран",
  "Массовое лечение ран",
  "Слово исцеления",
  "Благословение",
  "Щит веры",
  "Священное пламя",
  "Волна грома",
  "Громовая волна",
  "Усыпление",
  "Огненный луч",
  "Туманный шаг",
  "Парящий диск Тензера",
  "Рассеивание магии",
  "Завеса тьмы",
  "Пылающие руки",
  "Горящие руки",
  "Защита от зла",
  "Доспех мага",
  "Каменная кожа",
  "Прозрачность",
  "Невидимость",
  "Полёт",
  "Страх",
  "Призрак",
  "Поднять мёртвых",
  "Анимировать мёртвых",
  "Лик мёртвых",
  "Луч холода",
  "Огненный снаряд",
  "Праймальный разлом",
  "Тёрновый кнут",
  "Землетрясение",
  "Метеоритный рой",
  "Остановка времени",
  "Похищение разума",
  "Кара небес",
  "Слово силы: Оглушить",
  "Слово силы: Умертвить",
  "Слово силы: Исцелить",
];

function inferSpellNameFromChat(text: string): string | null {
  for (const name of SPELL_NAMES_RU) {
    if (text.includes(name)) return name;
  }
  // Fall back: any «<Name>» quoted text usually wraps a spell name in player actions.
  const m = /«([^»]+)»/.exec(text);
  if (m && m[1].length > 2 && m[1].length < 40) return m[1];
  return null;
}

/** Infer a damage type from a Russian label or notation. */
function inferDamageType(label: string, notation: string = ""): string {
  const text = `${label} ${notation}`.toLowerCase();
  if (text.includes("огн") || text.includes("fire")) return "fire";
  if (text.includes("холод") || text.includes("лёд") || text.includes("cold")) return "cold";
  if (text.includes("молни") || text.includes("электр") || text.includes("lightning")) return "lightning";
  if (text.includes("яд") || text.includes("poison")) return "poison";
  if (text.includes("некро") || text.includes("necrotic")) return "necrotic";
  if (text.includes("свет") || text.includes("свят") || text.includes("radiant")) return "radiant";
  if (text.includes("кислот") || text.includes("acid")) return "acid";
  if (text.includes("гром") || text.includes("thunder")) return "thunder";
  if (text.includes("сил") || text.includes("force")) return "force";
  return "physical";
}

/** Condition past-tense verb patterns the DM narrates (Russian, lowercase). */
const CONDITION_VERBS: { verb: string; condition: string }[] = [
  { verb: "отравлен", condition: "poisoned" },
  { verb: "оглушён", condition: "stunned" },
  { verb: "ошеломлён", condition: "stunned" },
  { verb: "напуган", condition: "frightened" },
  { verb: "ослеплён", condition: "blinded" },
  { verb: "ослаблен", condition: "weakened" },
  { verb: "замедлен", condition: "slowed" },
  { verb: "сбит с ног", condition: "prone" },
  { verb: "повержен с ног", condition: "prone" },
  { verb: "связан", condition: "restrained" },
  { verb: "схвачен", condition: "grappled" },
  { verb: "парализован", condition: "paralyzed" },
  { verb: "очарован", condition: "charmed" },
  { verb: "горит", condition: "burning" },
  { verb: "благословлён", condition: "blessed" },
  { verb: "под щитом", condition: "shielded" },
  { verb: "невидим", condition: "invisible" },
  { verb: "невидимым", condition: "invisible" },
];

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build the chronological list of `TurnEvent`s for the most recent combat
 * round (`round`). Returns an empty array if there's nothing to replay.
 *
 * @param diceRolls   the room's recent dice rolls (from snapshot.diceLog)
 * @param chatMessages the room's recent chat messages (from snapshot.chat)
 * @param players     current players in the room (for name + position lookup)
 * @param monsters    current monsters in the room (for name + position lookup)
 * @param round       the round to reconstruct (typically snapshot.round)
 */
export function buildTurnEvents(
  diceRolls: DiceRollState[],
  chatMessages: ChatMessageState[],
  players: PlayerState[],
  monsters: MonsterState[],
  round: number,
): TurnEvent[] {
  const events: TurnEvent[] = [];

  // 1) Filter rolls for the requested round, chronological.
  const roundRolls = chronological(
    diceRolls.filter((r) => r.round === round && r.label !== "Инициатива"),
  );

  // 2) Filter chat messages for the requested round, chronological.
  const roundChat = chronological(
    chatMessages.filter((m) => m.round === round),
  );

  // 3) Walk the rolls in order, pairing attack rolls with the next damage
  //    roll by the same roller (within a small window) to build attack events.
  const usedDamageIdx = new Set<number>(); // damage rolls already consumed by an attack

  for (let i = 0; i < roundRolls.length; i++) {
    const roll = roundRolls[i];

    // ----- Player attack on monster -----
    if (isD20Attack(roll)) {
      const isPlayerRoller = players.some((p) => p.name === roll.roller);
      const isMonsterRoller = monsters.some((m) => m.name === roll.roller);
      if (isPlayerRoller) {
        // Target = monster (extract from label).
        const targetName = extractMonsterFromAttackLabel(roll.label, monsters);
        const hit = roll.success === true;
        const crit = roll.result === 20;
        // Look ahead for a damage roll by the same roller within the next 6 rolls.
        let damage: number | undefined;
        let damageType: string | undefined;
        for (let j = i + 1; j < Math.min(i + 7, roundRolls.length); j++) {
          if (usedDamageIdx.has(j)) continue;
          const next = roundRolls[j];
          if (next.roller !== roll.roller) continue;
          if (!isPlayerDamageToMonster(next) && !isAoeSpellDamage(next)) continue;
          damage = next.total;
          damageType = inferDamageType(next.label, next.notation);
          usedDamageIdx.add(j);
          break;
        }
        events.push({
          type: "attack",
          actor: roll.roller,
          target: targetName ?? "?",
          hit,
          damage,
          damageType,
          crit,
          ts: tsOf(roll),
        });
        continue;
      }
      if (isMonsterRoller) {
        // Monster attacking — target = a player (we don't know which from the
        // label alone; pick the closest alive player to the monster's current
        // position as a best-effort target).
        const monster = monsters.find((m) => m.name === roll.roller);
        let targetName: string | null = null;
        if (monster) {
          const alivePlayers = players.filter((p) => p.isAlive && p.hp > 0);
          let best: PlayerState | null = null;
          let bestDist = Infinity;
          for (const p of alivePlayers) {
            const d = Math.hypot(p.posX - monster.posX, p.posY - monster.posY);
            if (d < bestDist) {
              bestDist = d;
              best = p;
            }
          }
          if (best) targetName = best.name;
        }
        const hit = roll.success === true;
        const crit = roll.result === 20;
        // Look ahead for "Урон: <monster>..." damage roll.
        let damage: number | undefined;
        let damageType: string | undefined;
        for (let j = i + 1; j < Math.min(i + 7, roundRolls.length); j++) {
          if (usedDamageIdx.has(j)) continue;
          const next = roundRolls[j];
          if (next.roller !== roll.roller) continue;
          if (!isMonsterDamageToPlayer(next)) continue;
          damage = next.total;
          damageType = inferDamageType(next.label, next.notation);
          usedDamageIdx.add(j);
          break;
        }
        events.push({
          type: "attack",
          actor: roll.roller,
          target: targetName ?? "?",
          hit,
          damage,
          damageType,
          crit,
          ts: tsOf(roll),
        });
        continue;
      }
    }

    // ----- AoE spell base-damage roll → emit spell event -----
    if (isSpellBaseDamage(roll)) {
      const element = extractElementFromSpellLabel(roll.label);
      // Find the spell name from the most recent chat message by this roller.
      const rollerChat = roundChat
        .filter((c) => c.createdAt && Date.parse(c.createdAt) <= tsOf(roll) + 5000)
        .reverse();
      let spellName = "Заклинание";
      for (const c of rollerChat) {
        const inferred = inferSpellNameFromChat(c.content);
        if (inferred) {
          spellName = inferred;
          break;
        }
      }
      // Targets = every monster/player who took AoE damage (look ahead for
      // "Урон по <name>..." rolls attributed to this roller).
      const targets: string[] = [];
      let totalDamage = 0;
      for (let j = i + 1; j < roundRolls.length; j++) {
        if (usedDamageIdx.has(j)) continue;
        const next = roundRolls[j];
        if (next.roller !== roll.roller) continue;
        if (!isAoeSpellDamage(next)) continue;
        const t = extractTargetFromAoeLabel(next.label, players, monsters);
        if (t && !targets.includes(t)) targets.push(t);
        totalDamage += next.total;
        usedDamageIdx.add(j);
      }
      events.push({
        type: "spell",
        actor: roll.roller,
        spellName,
        targets,
        damage: totalDamage > 0 ? totalDamage : roll.total,
        damageType: element,
        ts: tsOf(roll),
      });
      continue;
    }

    // ----- Standalone heal roll → heal event -----
    if (isHeal(roll)) {
      events.push({
        type: "heal",
        target: roll.roller,
        amount: roll.total,
        ts: tsOf(roll),
      });
      continue;
    }

    // ----- Standalone damage rolls (not consumed by an attack/spell above) -----
    // These are typically trap damage, surface reactions, or backlash.
    if (!usedDamageIdx.has(i)) {
      if (isMonsterDamageToPlayer(roll)) {
        // Already covered if paired with an attack; if we got here it's standalone.
        const monsterName = extractMonsterFromMonsterDamageLabel(roll.label, monsters);
        // Find the closest alive player to the monster as the target.
        let target = "?";
        if (monsterName) {
          const m = monsters.find((x) => x.name === monsterName);
          if (m) {
            const alivePlayers = players.filter((p) => p.isAlive && p.hp > 0);
            let best: PlayerState | null = null;
            let bestDist = Infinity;
            for (const p of alivePlayers) {
              const d = Math.hypot(p.posX - m.posX, p.posY - m.posY);
              if (d < bestDist) {
                bestDist = d;
                best = p;
              }
            }
            if (best) target = best.name;
          }
        }
        events.push({
          type: "damage",
          target,
          amount: roll.total,
          damageType: inferDamageType(roll.label, roll.notation),
          ts: tsOf(roll),
        });
        continue;
      }
      if (isAoeSpellDamage(roll)) {
        // Standalone AoE damage (no base-damage roll before it — possibly
        // generated by a monster's breath weapon). Emit as a damage event.
        const t = extractTargetFromAoeLabel(roll.label, players, monsters);
        if (t) {
          events.push({
            type: "damage",
            target: t,
            amount: roll.total,
            damageType: inferDamageType(roll.label, roll.notation),
            ts: tsOf(roll),
          });
        }
        continue;
      }
      if (isActorDamage(roll)) {
        // "Урон по герою" — backlash damage to the actor.
        events.push({
          type: "damage",
          target: roll.roller,
          amount: roll.total,
          damageType: inferDamageType(roll.label, roll.notation),
          ts: tsOf(roll),
        });
        continue;
      }
      if (isPlayerDamageToMonster(roll)) {
        // Player damage without a preceding d20 attack — emit as a damage event
        // to the monster named in the label.
        const m = /по:\s*([^(]+)/.exec(roll.label);
        const target = m ? m[1].trim() : "?";
        events.push({
          type: "damage",
          target,
          amount: roll.total,
          damageType: inferDamageType(roll.label, roll.notation),
          ts: tsOf(roll),
        });
        continue;
      }
    }
  }

  // 4) Scan chat messages for movement verbs and condition applications.
  //    Movement events are best-effort (we don't have previous positions); we
  //    use the actor's CURRENT position as both `from` and `to` so the
  //    highlight fires, even though the token doesn't visually translate.
  const MOVE_VERBS = ["перемещается", "переместился", "прыгает", "прыгнул", "отступает", "отступил", "бежит", "пробежал", "идёт", "шагает", "подбирается", "подходит", "отходит", "прыжок", "рывком"];
  for (const msg of roundChat) {
    const text = msg.content.toLowerCase();
    // Find the actor: prefer the speaker (player) or a combatant named in the text.
    let actor: string | null = null;
    if (msg.speaker && (players.some((p) => p.name === msg.speaker) || monsters.some((m) => m.name === msg.speaker))) {
      actor = msg.speaker;
    } else {
      for (const p of players) {
        if (msg.content.includes(p.name)) {
          actor = p.name;
          break;
        }
      }
      if (!actor) {
        for (const m of monsters) {
          if (msg.content.includes(m.name)) {
            actor = m.name;
            break;
          }
        }
      }
    }
    if (!actor) continue;
    const combatant = findCombatant(actor, players, monsters);
    if (!combatant) continue;

    // Move event (best-effort, current pos = from = to).
    if (MOVE_VERBS.some((v) => text.includes(v))) {
      events.push({
        type: "move",
        actor,
        from: { ...combatant.pos },
        to: { ...combatant.pos },
        ts: Date.parse(msg.createdAt) || 0,
      });
    }

    // Condition events — scan for past-tense condition verbs.
    for (const { verb, condition } of CONDITION_VERBS) {
      if (text.includes(verb)) {
        events.push({
          type: "condition",
          target: actor,
          condition,
          applied: true,
          ts: Date.parse(msg.createdAt) || 0,
        });
      }
    }
  }

  // 5) Final sort by timestamp + de-duplicate near-identical condition events
  //    (the same condition can be mentioned multiple times in one narrative).
  events.sort((a, b) => a.ts - b.ts);
  const deduped: TurnEvent[] = [];
  const seenCondKeys = new Set<string>();
  for (const ev of events) {
    if (ev.type === "condition") {
      const key = `${ev.target}:${ev.condition}`;
      if (seenCondKeys.has(key)) continue;
      seenCondKeys.add(key);
    }
    deduped.push(ev);
  }

  return deduped;
}

// Shared game types for the D&D 5e VTT AI Dungeon Master (multiplayer).

export type ActionCategory =
  | "combat"
  | "exploration"
  | "social"
  | "ability_check"
  | "invalid"
  | "other";

/** A roll the DM decides must happen to resolve the player's action. */
export interface PlannedRoll {
  label: string;
  notation: string;
  modifier: number;
  target: number;
  target_type: "AC" | "DC" | "none";
  ability?: string;
}

export interface InventoryChange {
  action: "add" | "remove";
  item: string;
  type: string;
  description?: string;
}

export interface TokenMove {
  name: string;
  newX: number;
  newY: number;
}

export interface OutcomeEffects {
  narrative: string;
  monsterDamage?: { notation: string; target: string } | null;
  playerDamage?: { notation: string; target?: string } | null;
  healing?: { notation: string; target?: string } | null;
  inventory: InventoryChange[];
  tokenMoves: TokenMove[];
  monsterDies?: boolean;
  goldChange?: number;
  sceneChange?: boolean;
  /** Conditions applied to a player/monster by this outcome. */
  conditions?: PlannedCondition[];
}

/** A condition the DM planned to apply to a target. */
export interface PlannedCondition {
  target: string; // target name
  type: string; // condition id (poisoned, stunned, ...)
  duration: number; // rounds
  source: string; // who/what applied it
}

export interface DMResolution {
  category: ActionCategory;
  invalidReason?: string; // when category === "invalid": why the action is impossible
  rolls: PlannedRoll[];
  success: OutcomeEffects;
  failure: OutcomeEffects;
  imagePrompt: string;
  imageNeeded: boolean;
  /** DM-requested advantage on the attack roll (overridden by backend if conditions force a mode). */
  advantage?: "advantage" | "disadvantage" | "none";
}

export interface ResolvedRoll {
  label: string;
  notation: string;
  modifier: number;
  result: number;
  total: number;
  target?: number;
  success?: boolean;
  purpose: string;
  /** Advantage mode used for this roll (only meaningful for d20 attack rolls). */
  advantageMode?: "advantage" | "disadvantage" | "none" | null;
  /** All d20 rolls (e.g. both rolls for advantage/disadvantage). Single element for normal rolls. */
  allRolls?: number[];
}

export interface ResolvedEvent {
  actorName: string;
  playerRolls: ResolvedRoll[];
  monsterRolls: ResolvedRoll[];
  outcome: "success" | "failure";
  combatStarted: boolean;
  combatEnded: boolean;
  damageDealtToMonster: number;
  monsterThatDied: string | null;
  damageDealtToPlayer: number;
  damagedPlayer: string | null;
  healingToPlayer: number;
  healedPlayer: string | null;
  inventoryChanges: InventoryChange[];
  goldChange: number;
  imagePrompt: string;
  imageNeeded: boolean;
  finalNarrative: string;
  /** whose turn is next (combatant name), or null if out of combat */
  nextTurn: string | null;
  nextTurnType: "player" | "monster" | null;
  round: number;
}

export interface PlayerState {
  id: string;
  name: string;
  charClass: string;
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  proficiencyBonus: number;
  gold: number;
  posX: number;
  posY: number;
  color: string;
  weaponName: string;
  weaponNotation: string;
  portraitUrl: string | null;
  isHost: boolean;
  isAlive: boolean;
  race: string;
  raceName: string;
  background: string;
  backgroundName: string;
  xp: number;
  selectedTalents: string[];
  bonusStr: number;
  bonusDex: number;
  bonusCon: number;
  bonusInt: number;
  bonusWis: number;
  bonusCha: number;
  pendingLevelUp: boolean;
  /** Current spell slots per level: {"1":2,"2":0,...} */
  spellSlots: Record<string, number>;
  /** Max spell slots per level: {"1":2,"2":0,...} */
  maxSpellSlots: Record<string, number>;
  /** Hit die size (e.g. 8 for d8). */
  hitDice: number;
}

export interface MonsterState {
  id: string;
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
  isActive: boolean;
}

export interface InventoryItemState {
  id: string;
  playerName: string;
  itemName: string;
  itemType: string;
  quantity: number;
  description: string;
}

export interface ChatMessageState {
  id: string;
  role: "dm" | "player" | "system";
  speaker: string;
  content: string;
  imageUrl: string | null;
  round: number;
  createdAt: string;
}

export interface DiceRollState {
  id: string;
  round: number;
  roller: string;
  label: string;
  notation: string;
  modifier: number;
  result: number;
  total: number;
  target: number | null;
  success: boolean | null;
  advantageMode: string | null; // "advantage" | "disadvantage" | null
  allRolls: number[] | null; // all d20 rolls (for advantage/disadvantage)
  createdAt: string;
}

export interface SceneState {
  id: string;
  imageUrl: string;
  prompt: string;
  title: string;
}

export interface InitiativeEntryState {
  id: string;
  combatantName: string;
  combatantType: "player" | "monster";
  initiative: number;
  order: number;
  monsterId: string | null;
  isAlive: boolean;
}

/** An active condition on a player or monster. */
export interface ConditionState {
  id: string;
  targetName: string;
  targetType: "player" | "monster";
  condition: string; // condition id
  duration: number; // rounds remaining
  source: string;
  createdAt: string;
}

export interface GameStateSnapshot {
  roomCode: string;
  hostName: string;
  players: PlayerState[];
  monsters: MonsterState[];
  inventory: InventoryItemState[];
  chat: ChatMessageState[];
  diceLog: DiceRollState[];
  scene: SceneState | null;
  initiatives: InitiativeEntryState[];
  combatActive: boolean;
  round: number;
  location: string;
  turnIndex: number;
  /** name of the combatant whose turn it is (null out of combat) */
  currentTurnName: string | null;
  currentTurnType: "player" | "monster" | null;
  /** whose turn it is during exploration (null in combat) */
  currentExplorerName: string | null;
  /** active conditions on every player/monster in the room */
  conditions: ConditionState[];
}

export interface Stats {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface CharClassPreset {
  id: string;
  name: string;
  enName: string;
  description: string;
  charClass: string;
  hp: number;
  ac: number;
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
  gold: number;
  color: string;
  weaponName: string;
  weaponNotation: string;
  startItems: { name: string; type: string; description: string }[];
}

export interface RacePreset {
  id: string;
  name: string;
  enName: string;
  description: string;
  bonuses: Partial<Stats>;
  trait: string;
  color: string;
}

export interface BackgroundPreset {
  id: string;
  name: string;
  enName: string;
  description: string;
  goldBonus: number;
  skill: string;
  item: { name: string; type: string; description: string };
}

// ---------- Talents (feats granted on level-up) ----------
export type TalentEffect =
  | { type: "counterattack"; chance: number; damageNotation: string }
  | { type: "damage_resistance_pct"; value: number } // 0..1, reduces incoming damage
  | { type: "damage_resistance_flat"; value: number } // flat reduction
  | { type: "crit_range"; minRoll: number } // crit on natural d20 >= minRoll
  | { type: "crit_bonus_dice"; dice: number } // extra weapon dice on a crit
  | { type: "extra_attack_chance"; chance: number } // chance for a 2nd attack
  | { type: "heal_on_kill"; notation: string } // heal when you kill an enemy
  | { type: "initiative_bonus"; value: number }
  | { type: "damage_bonus_flat"; value: number } // + to all weapon damage
  | { type: "ac_bonus"; value: number }
  | { type: "vampiric_pct"; value: number } // heal % of damage dealt
  | { type: "reroll_miss_once" } // reroll one missed attack per turn
  | { type: "save_bonus"; value: number } // bonus to ability checks
  | { type: "hp_bonus"; value: number }; // +max HP (and current)

export interface Talent {
  id: string;
  classId: string;
  name: string;
  description: string;
  effect: TalentEffect;
}

/** A starting location + opening hook for a fresh adventure. */
export interface StartLocation {
  id: string;
  name: string;
  prompt: string; // image prompt (English)
  intro: string; // Russian opening narrative template; {name} = host name
  monsters: { name: string; label: string; hp: number; maxHp: number; ac: number; damageNotation: string; attackBonus: number; posX: number; posY: number; color: string; description: string }[];
}

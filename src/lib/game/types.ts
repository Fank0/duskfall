// Shared game types for the d20 fantasy RPG VTT AI Game Master (multiplayer).

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
  /** Optional quest journal update — create a new quest or change an existing one's status. */
  quest?: PlannedQuest | null;
  /** Optional NPC to introduce/upsert in the room. */
  npc?: PlannedNpc | null;
  /** Optional crafting stations the DM grants (e.g. when the hero finds an alchemy lab or forge). */
  stations?: ("alchemy" | "forge" | "enchant")[];
  /**
   * Optional spell ID for the actor to learn from a found scroll ("scroll of
   * <spell name>"). When set, the dm-agent resolves the spell ID and adds it
   * to the actor's `spellbookSpells` list (extra spells beyond their class
   * base set). The scroll inventory item is consumed separately.
   */
  learnSpell?: string;
}

/** A quest the DM planned to add/update in the room's journal. */
export interface PlannedQuest {
  title: string;
  description?: string;
  objectives?: string;
  reward?: string;
  /** "active" creates a new quest; "completed"/"failed" can update an existing quest with the same title. */
  status: "active" | "completed" | "failed";
}

/** An NPC the DM planned to introduce in the room. */
export interface PlannedNpc {
  name: string;
  role: "merchant" | "questgiver" | "ally" | "enemy";
  disposition?: "friendly" | "neutral" | "hostile";
  location?: string;
  notes?: string;
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
  /** Area-of-effect shape for spells like Fireball / Lightning / Cone of Cold. */
  aoeShape?: "circle" | "cone" | "line";
  /** AoE size in cells (radius for circle, length for line/cone). */
  aoeSize?: number;
  /** AoE origin point on the grid (the cell the effect is centered on / starts from). */
  aoeOrigin?: { x: number; y: number };
  /** Direction vector for line/cone AoE (dx,dy each in {-1,0,1}). */
  aoeDirection?: { x: number; y: number };
  /** Saving-throw ability for AoE targets (e.g. "ЛОВ", "ТЕЛ"). */
  saveAbility?: string;
  /** Saving-throw DC for AoE targets. */
  saveDC?: number;
  /** Elemental flavor of the AoE (drives the overlay color). */
  aoeElement?: string; // "fire" | "cold" | "lightning" | "acid" | "force" | "poison" | "thunder"
  /** Spell slot level used (for upcast damage scaling). 0 = cantrip/no slot. */
  slotLevel?: number;
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
  /** AoE info for grid overlay (transient — shown for ~2s after the action). */
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
  /** Player-authored backstory (up to 500 chars). Empty string when not set. */
  backstory: string;
  xp: number;
  selectedTalents: string[];
  bonusStr: number;
  bonusDex: number;
  bonusCon: number;
  bonusInt: number;
  bonusWis: number;
  bonusCha: number;
  pendingLevelUp: boolean;
  pendingLevelUps: number;
  /** When true, the player must pick an ASI (Ability Score Improvement, +2 to a chosen stat) — granted at levels 5/9/13/17. */
  pendingASI: boolean;
  /** Current spell slots per level: {"1":2,"2":0,...} */
  spellSlots: Record<string, number>;
  /** Max spell slots per level: {"1":2,"2":0,...} */
  maxSpellSlots: Record<string, number>;
  /** Hit die size (e.g. 8 for d8). */
  hitDice: number;
  /** BG3: short rests used between long rests (max 3). */
  shortRestsUsed: number;
  /**
   * Extra spell IDs the player has learned beyond their class base set
   * (e.g. by reading a scroll of <spell name> the DM agent granted via the
   * `learnSpell` plan field). The class base spell list is derived from
   * class + level in spellbook.ts; this list only stores the *extra* spells.
   */
  spellbookSpells?: string[];
  /** Equipped inventory-item ids per slot (null = empty). */
  equipment: {
    weapon: string | null;
    shield: string | null;
    head: string | null;
    chest: string | null;
    legs: string | null;
    hands: string | null;
    accessory1: string | null;
    accessory2: string | null;
  };
  // ===== BG3/D&D 5e action economy + death saves =====
  /** Temporary HP (absorbed before real HP). */
  tempHp: number;
  /** Dying state: when HP reaches 0 the character is dying (not dead). */
  isDying: boolean;
  /** Death save successes (0-3). 3 = stable. */
  deathSaveSuccess: number;
  /** Death save failures (0-3). 3 = dead. */
  deathSaveFailure: number;
  /** Action used this turn (reset at turn start). */
  actionUsed: boolean;
  /** Bonus action used this turn (reset at turn start). */
  bonusActionUsed: boolean;
  /** Reaction used this round (reset at turn start). */
  reactionUsed: boolean;
  /** Spell name currently concentrating on (empty = none). */
  concentratingOn: string;
  /** D&D 5e skill proficiencies (JSON array of skill names). */
  skillProficiencies: string[];
  /** D&D 5e saving throw proficiencies (JSON array of save names). */
  saveProficiencies: string[];
  /** Passive perception = 10 + WIS mod + proficiency (if proficient). */
  passivePerception: number;
  /** Spell save DC = 8 + proficiency bonus + casting stat mod. */
  spellSaveDC: number;
  /** D&D 5e class resources (Rage, Lay on Hands, Ki, etc.). */
  classResources: Record<string, { current: number; max: number }>;
  /** D&D 5e movement (item #2): speed in feet, feet used this turn, Dash flag. */
  speed: number;
  movementUsed: number;
  dashActive: boolean;
  /** D&D 5e Fighting Style: archery, defense, dueling, great_weapon, two_weapon, protection, none. */
  fightingStyle: string;
  /** D&D 5e (V2 C5): GWM/Sharpshooter -5/+10 toggle. */
  gwmActive: boolean;
  /** D&D 5e (MASTER-PLAN 4.2): Multiclass levels JSON, e.g. {"Fighter":3,"Wizard":2}. */
  classLevelsJson: string;
  /** D&D 5e (MASTER-PLAN 6.5): true for NPC companions (AI-DM controlled). */
  isCompanion: boolean;
  /** D&D 5e (MASTER-PLAN 6.2): Z-height level (0=ground, 1=ledge, 2=cliff). */
  posZ: number;
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
  /** D&D 5e (MASTER-PLAN 6.2): Z-height level (0=ground, 1=ledge, 2=cliff). */
  posZ: number;
  color: string;
  description: string;
  isActive: boolean;
  /** True for dungeon bosses (Пункт 36). Awards 3× XP + treasure on death. */
  isBoss?: boolean;
  /** Special-ability blurb shown in the monster's description (bosses). */
  specialAbility?: string;
  /** D&D 5e: damage types the monster resists (half damage). */
  resistances?: string[];
  /** D&D 5e: damage types the monster is immune to (no damage). */
  immunities?: string[];
  /** D&D 5e: conditions the monster is immune to. */
  conditionImmunities?: string[];
  /**
   * D3 — D&D 5e creature size category: tiny | small | medium | large | huge | gargantuan.
   * Drives the on-grid token span (1×1 / 2×2 / 3×3 / 4×4) and multi-cell
   * pathfinding. Defaults to "medium" when not set.
   */
  size?: string;
}

export interface InventoryItemState {
  id: string;
  playerName: string;
  itemName: string;
  itemType: string;
  quantity: number;
  description: string;
  /** Equipment slot inferred from name/type. Null = not equippable. */
  equipSlot: EquipmentSlot | null;
  /** AC bonus when equipped (armor/shield). */
  acBonus: number;
  /** Stat bonuses when equipped. */
  statBonus: Partial<Stats>;
  /** Damage notation for weapons (e.g. "1d8+3"). */
  damageNotation: string;
  /** D&D 5e: true if the player has attuned to this magic item. */
  attuned: boolean;
}

/** Equipment slots on a character doll. */
export type EquipmentSlot = "weapon" | "shield" | "head" | "chest" | "legs" | "hands" | "accessory";

export interface ChatMessageState {
  id: string;
  role: "dm" | "player" | "system" | "party";
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

/** A quest tracked in the room's quest journal. */
export interface QuestState {
  id: string;
  title: string;
  description: string;
  status: "active" | "completed" | "failed";
  objectives: string[];
  reward: string;
  createdAt: string;
  updatedAt: string;
}

/** A room node in the procedural world map. */
export type MapRoomType = "combat" | "loot" | "npc" | "puzzle" | "safe" | "boss" | "entrance" | "trap";

export interface MapRoomState {
  id: string;
  x: number;
  y: number;
  label: string;
  roomType: MapRoomType;
  discovered: boolean;
  connections: { x: number; y: number }[];
  description: string;
  /** True for hidden secret rooms (Пункт 36). Shown with a star icon when discovered. */
  secret?: boolean;
  /** Image-prompt fragment for the scene art of this room. */
  scenePrompt?: string;
  /** True once populateRoomContent has filled this room with biome-themed content. */
  populated?: boolean;
}

/** An NPC living in the room. */
export type NpcRole = "merchant" | "questgiver" | "ally" | "enemy";
export type NpcDisposition = "friendly" | "neutral" | "hostile";

/** Time-of-day cycle (matches Room.timeOfDay). */
export type TimeOfDay = "dawn" | "day" | "dusk" | "night";

/**
 * B6: A single entry in an NPC's daily schedule.
 * The NPC is at `location`, doing `activity`, during `timeOfDay`.
 * Optional `availableQuests` (titles) unlock at this time only.
 * Optional `dialogueHint` is a Russian free-form hint passed to the LLM
 * when generating in-character dialogue during this time slot.
 *
 * An `activity` containing "сон" / "спит" / "sleep" marks the NPC as
 * unavailable for dialogue (the dialogue route rejects the request).
 * An `activity` containing "занят" / "busy" likewise blocks dialogue.
 */
export interface NpcScheduleEntry {
  timeOfDay: TimeOfDay;
  location: string;
  activity: string;
  availableQuests?: string[];
  dialogueHint?: string;
}

export interface NpcState {
  id: string;
  name: string;
  role: NpcRole;
  disposition: NpcDisposition;
  isAlive: boolean;
  location: string;
  notes: string;
  /** D&D 5e (MASTER-PLAN 6.4): NPC loyalty score 0-100. */
  loyalty: number;
  /** B6: time-of-day schedule (parsed from JSON; empty when no schedule). */
  schedule: NpcScheduleEntry[];
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
  /** quests tracked in the room's journal */
  quests: QuestState[];
  /** discovered rooms of the world map (only revealed ones reach the client) */
  mapRooms: MapRoomState[];
  /** NPCs present in the room */
  npcs: NpcState[];
  /** current time of day cycle: dawn | day | dusk | night */
  timeOfDay: "dawn" | "day" | "dusk" | "night";
  /** current weather: clear | rain | fog | storm | snow */
  weather: "clear" | "rain" | "fog" | "storm" | "snow";
  /** current world-map position (room coordinates the party is in) */
  currentMapPos: { x: number; y: number } | null;
  /** crafting stations present in the room */
  hasAlchemy: boolean;
  hasForge: boolean;
  hasEnchant: boolean;
  /** ground loot cells (items with playerName="__ground__" spread across grid cells) — item 20 */
  lootCells: { x: number; y: number; itemName: string }[];
  /** trap cells on the grid (DM-populated; empty for now) — item 20 */
  traps: { x: number; y: number; discovered: boolean }[];
  /** D&D 5e tactical terrain features on the combat grid */
  terrainCells: { x: number; y: number; type: string; duration?: number }[];
  /** ===== Dungeon generator (Пункт 36) ===== */
  /** Active biome id (catacombs | caves | tower | forest | dungeon). */
  dungeonBiome: string;
  /** Current dungeon depth (1 = first level). */
  dungeonDepth: number;
  /** True once the boss of the current depth has been slain. */
  dungeonCleared: boolean;
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
export type StatKey = "str" | "dex" | "con" | "int" | "wis" | "cha";

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
  | { type: "hp_bonus"; value: number } // +max HP (and current)
  | { type: "asi"; stat: StatKey; value: number } // +value to a chosen stat (ASI)
  | { type: "passive" }; // passive effect (subclass, no mechanical computation needed)

export interface Talent {
  id: string;
  classId: string;
  name: string;
  description: string;
  effect: TalentEffect;
  /** Talent tree tier: 1 = available from level 2, 2 = requires a tier-1 talent. */
  tier?: 1 | 2;
  /** Required talent id (for tier-2 talents). The player must already have this talent. */
  requires?: string;
  /** Source: talent (level-up pick) or subclass (chosen at level 3). */
  source?: "talent" | "subclass";
}

/** A starting location + opening hook for a fresh adventure. */
export interface StartLocation {
  id: string;
  name: string;
  prompt: string; // image prompt (English)
  // dm-context-fix Fix 3: the hardcoded `intro` template was REMOVED — the DM
  // now generates a unique opening narrative on the first player action via
  // the LLM (see Room.introNeeded + dm-agent.resolvePlayerMechanics).
  monsters: { name: string; label: string; hp: number; maxHp: number; ac: number; damageNotation: string; attackBonus: number; posX: number; posY: number; color: string; description: string }[];
}

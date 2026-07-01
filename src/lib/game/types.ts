// Shared game types for the D&D 5e VTT AI Dungeon Master.

export type ActionCategory =
  | "combat"
  | "exploration"
  | "social"
  | "ability_check"
  | "other";

/** A roll the DM decides must happen to resolve the player's action. */
export interface PlannedRoll {
  label: string;
  notation: string; // e.g. "1d20"
  modifier: number;
  target: number; // DC or AC
  target_type: "AC" | "DC" | "none";
  ability?: string; // STR/DEX/etc for ability checks
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

/** Effects to apply on a particular outcome branch. */
export interface OutcomeEffects {
  narrative: string;
  monsterDamage?: { notation: string; target: string } | null;
  playerDamage?: { notation: string } | null;
  healing?: { notation: string } | null;
  inventory: InventoryChange[];
  tokenMoves: TokenMove[];
  monsterDies?: boolean;
  goldChange?: number;
  /** whether the scene should be re-illustrated */
  sceneChange?: boolean;
}

/** The structured mechanics the DM produces for a player action. */
export interface DMResolution {
  category: ActionCategory;
  rolls: PlannedRoll[];
  success: OutcomeEffects;
  failure: OutcomeEffects;
  imagePrompt: string;
  imageNeeded: boolean;
}

/** A resolved dice roll with concrete numbers. */
export interface ResolvedRoll {
  label: string;
  notation: string;
  modifier: number;
  result: number; // raw dice sum
  total: number; // result + modifier
  target?: number;
  success?: boolean;
  purpose: string;
}

/** A complete event produced by the backend after resolving a round. */
export interface ResolvedEvent {
  playerRolls: ResolvedRoll[];
  monsterRolls: ResolvedRoll[];
  outcome: "success" | "failure";
  playerNarrative: string;
  monsterTurnTaken: boolean;
  damageDealtToMonster: number;
  damageDealtToPlayer: number;
  healingToPlayer: number;
  monsterThatDied: string | null;
  inventoryChanges: InventoryChange[];
  goldChange: number;
  imagePrompt: string;
  imageNeeded: boolean;
  finalNarrative: string;
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
  portraitUrl: string | null;
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
  itemName: string;
  itemType: string;
  quantity: number;
  description: string;
}

export interface ChatMessageState {
  id: string;
  role: "dm" | "player" | "system";
  content: string;
  imageUrl: string | null;
  round: number;
  createdAt: string;
}

export interface DiceRollState {
  id: string;
  round: number;
  label: string;
  notation: string;
  modifier: number;
  result: number;
  total: number;
  target: number | null;
  success: boolean | null;
  createdAt: string;
}

export interface SceneState {
  id: string;
  imageUrl: string;
  prompt: string;
  title: string;
}

export interface GameStateSnapshot {
  player: PlayerState;
  monsters: MonsterState[];
  inventory: InventoryItemState[];
  chat: ChatMessageState[];
  diceLog: DiceRollState[];
  scene: SceneState | null;
  combatActive: boolean;
  round: number;
  location: string;
  turn: string;
}

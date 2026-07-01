// Shared game types for the D&D 5e VTT AI Dungeon Master (multiplayer).

export type ActionCategory =
  | "combat"
  | "exploration"
  | "social"
  | "ability_check"
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
}

export interface DMResolution {
  category: ActionCategory;
  rolls: PlannedRoll[];
  success: OutcomeEffects;
  failure: OutcomeEffects;
  imagePrompt: string;
  imageNeeded: boolean;
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

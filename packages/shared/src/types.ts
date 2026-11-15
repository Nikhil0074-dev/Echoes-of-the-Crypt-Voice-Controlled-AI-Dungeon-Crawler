// ---------- Geometry ----------
export interface Vec2 { x: number; y: number }
export type AbsDirection = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
export type Direction = AbsDirection | 'FORWARD' | 'BACKWARD';

export const ABS_DIRECTIONS: readonly AbsDirection[] = ['NORTH', 'SOUTH', 'EAST', 'WEST'];
export const ALL_DIRECTIONS: readonly Direction[] = [...ABS_DIRECTIONS, 'FORWARD', 'BACKWARD'];
export const DIRECTION_VECTORS: Record<AbsDirection, Vec2> = {
  NORTH: { x: 0, y: -1 },
  SOUTH: { x: 0, y: 1 },
  EAST: { x: 1, y: 0 },
  WEST: { x: -1, y: 0 }
};
export const OPPOSITE: Record<AbsDirection, AbsDirection> = {
  NORTH: 'SOUTH', SOUTH: 'NORTH', EAST: 'WEST', WEST: 'EAST'
};
export const MAX_DISTANCE = 30;

// ---------- Commands ----------
export type SystemCommandName =
  | 'PAUSE' | 'RESUME' | 'SAVE' | 'MUTE' | 'UNMUTE' | 'STOP_LISTENING' | 'SETTINGS' | 'HELP';
export const SYSTEM_COMMANDS: readonly SystemCommandName[] =
  ['PAUSE', 'RESUME', 'SAVE', 'MUTE', 'UNMUTE', 'STOP_LISTENING', 'SETTINGS', 'HELP'];

export type StatusQuery = 'HEALTH' | 'GOLD' | 'LEVEL' | 'ENEMIES' | 'ALL';
export const STATUS_QUERIES: readonly StatusQuery[] = ['HEALTH', 'GOLD', 'LEVEL', 'ENEMIES', 'ALL'];

export type Action =
  | { type: 'MOVE'; direction: Direction; distance: number; careful?: boolean }
  | { type: 'MOVE_TO'; target: string }
  | { type: 'ATTACK'; target?: string }
  | { type: 'DEFEND' }
  | { type: 'CAST'; spell?: string }
  | { type: 'INTERACT'; target?: string }
  | { type: 'COLLECT'; target?: string }
  | { type: 'USE_ITEM'; item: string }
  | { type: 'EQUIP_ITEM'; item: string }
  | { type: 'DROP_ITEM'; item: string }
  | { type: 'LOOK' }
  | { type: 'LOCATE'; target: string }
  | { type: 'STATUS'; query: StatusQuery }
  | { type: 'INVENTORY' }
  | { type: 'QUEST' }
  | { type: 'STOP' }
  | { type: 'SYSTEM'; command: SystemCommandName };

export type ActionType = Action['type'];
export const ACTION_TYPES: readonly ActionType[] = [
  'MOVE', 'MOVE_TO', 'ATTACK', 'DEFEND', 'CAST', 'INTERACT', 'COLLECT', 'USE_ITEM', 'EQUIP_ITEM',
  'DROP_ITEM', 'LOOK', 'LOCATE', 'STATUS', 'INVENTORY', 'QUEST', 'STOP', 'SYSTEM'
];
export type Intent = ActionType | 'SEQUENCE' | 'UNKNOWN';

export interface GameCommand {
  commandId: string;
  transcript: string;
  intent: Intent;
  actions: Action[];
  confidence: number;
  requiresConfirmation: boolean;
  clarification?: string;
  source?: 'local' | 'llm' | 'keyboard';
}

/** Small, relevant slice of game state given to the interpreter. */
export interface ParseContext {
  facing?: AbsDirection;
  nearbyEnemies?: string[];
  lastTarget?: string;
}

// ---------- Game state ----------
export type Terrain = 'WALL' | 'FLOOR' | 'EXIT';
export type ItemId = 'health_potion' | 'iron_sword' | 'wooden_shield' | 'dungeon_key';
export type EnemyKind = 'goblin' | 'skeleton';

export interface InventoryItem { id: ItemId; quantity: number }
export interface DoorState { id: string; pos: Vec2; state: 'CLOSED' | 'OPEN' | 'LOCKED' }
export interface ChestState {
  id: string; pos: Vec2; opened: boolean; locked: boolean;
  loot: { gold: number; items: InventoryItem[] };
}
export interface TrapState { id: string; pos: Vec2; damage: number; triggered: boolean }
export interface GroundItem { id: string; pos: Vec2; item: ItemId; quantity: number }
export interface EnemyState {
  id: string; kind: EnemyKind; name: string; pos: Vec2;
  health: number; maxHealth: number; attack: number; defense: number;
  xp: number; gold: number; aggroRange: number; alive: boolean;
}
export interface PlayerState {
  pos: Vec2; facing: AbsDirection;
  health: number; maxHealth: number; attack: number; defense: number;
  xp: number; level: number; gold: number;
  inventory: InventoryItem[];
  equipped: { weapon?: ItemId; armor?: ItemId };
  defending: boolean; alive: boolean;
}
export interface Objective { id: string; text: string; hint: string; done: boolean }
export type GameStatus = 'PLAYING' | 'WON' | 'DEAD';

export interface GameState {
  levelId: string;
  name: string;
  width: number;
  height: number;
  terrain: Terrain[][];
  explored: boolean[][];
  doors: DoorState[];
  chests: ChestState[];
  traps: TrapState[];
  items: GroundItem[];
  enemies: EnemyState[];
  player: PlayerState;
  objectives: Objective[];
  turn: number;
  status: GameStatus;
}

// ---------- Events (consumed by renderer / audio) ----------
export type GameEvent =
  | { kind: 'move'; from: Vec2; to: Vec2; direction: AbsDirection }
  | { kind: 'face'; direction: AbsDirection }
  | { kind: 'bump' }
  | { kind: 'enemyMove'; id: string; from: Vec2; to: Vec2 }
  | { kind: 'attack'; attacker: string; target: string }
  | { kind: 'damage'; target: string; amount: number }
  | { kind: 'heal'; amount: number }
  | { kind: 'defend' }
  | { kind: 'enemyDefeated'; id: string; xp: number; gold: number }
  | { kind: 'door'; id: string; state: DoorState['state'] }
  | { kind: 'chest'; id: string; gold: number }
  | { kind: 'pickup'; id: string; item: ItemId }
  | { kind: 'drop'; item: ItemId }
  | { kind: 'equip'; item: ItemId }
  | { kind: 'trap'; id: string; amount: number }
  | { kind: 'levelUp'; level: number }
  | { kind: 'objective'; id: string; text: string }
  | { kind: 'win' }
  | { kind: 'playerDied' };

export interface StepResult { action: Action; ok: boolean; message: string }
export interface ExecutionResult {
  state: GameState;
  ok: boolean;
  steps: StepResult[];
  messages: string[];
  events: GameEvent[];
  clarification?: string;
  system: SystemCommandName[];
}

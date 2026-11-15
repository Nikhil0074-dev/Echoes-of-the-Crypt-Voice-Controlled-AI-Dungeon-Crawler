import type { GameState, Objective, Terrain, ItemId, EnemyKind } from '@dungeon/shared';
import { ENEMY_TEMPLATES, PLAYER_BASE, TRAP_DAMAGE } from './constants';
import { reveal } from './grid';

export interface LevelDef {
  id: string;
  name: string;
  rows: string[];
  objectives?: Objective[];
}

/**
 * Legend: # wall  . floor  P player  G goblin  S skeleton  C chest  c locked chest
 *         T trap  H potion  W shield  K key  D door  L locked door  X exit
 */
export const CRYPT_OF_ECHOES: LevelDef = {
  id: 'crypt-1',
  name: 'Crypt of Echoes',
  rows: [
    '####################',
    '#P..W.#.......#....#',
    '#.....#.K.G...#..C.#',
    '#.....D.......L....#',
    '#..H..#...T...#....#',
    '################.###',
    '#..................#',
    '#.......T.....S....#',
    '#................X.#',
    '####################'
  ].map(r => r.padEnd(20, '#')),
  objectives: [
    { id: 'get_key', text: 'Find the dungeon key', hint: 'Open the wooden door and search the middle chamber.', done: false },
    { id: 'open_chest', text: 'Open the treasure chest', hint: 'Unlock the east door with the key.', done: false },
    { id: 'defeat_skeleton', text: 'Defeat the Skeleton Guardian', hint: 'It patrols the southern hall. Bring a potion.', done: false },
    { id: 'reach_exit', text: 'Reach the dungeon exit', hint: 'The portal glows in the south-east corner.', done: false }
  ]
};

export const LEVELS: Record<string, LevelDef> = { [CRYPT_OF_ECHOES.id]: CRYPT_OF_ECHOES };

export function parseLevel(def: LevelDef): GameState {
  const height = def.rows.length;
  const width = def.rows[0]?.length ?? 0;
  if (height === 0 || width === 0) throw new Error('Level is empty');
  for (const r of def.rows) if (r.length !== width) throw new Error(`Level row has width ${r.length}, expected ${width}`);

  const state: GameState = {
    levelId: def.id, name: def.name, width, height,
    terrain: [], explored: [], doors: [], chests: [], traps: [], items: [], enemies: [],
    player: {
      pos: { x: 1, y: 1 }, facing: 'SOUTH',
      health: PLAYER_BASE.health, maxHealth: PLAYER_BASE.health,
      attack: PLAYER_BASE.attack, defense: PLAYER_BASE.defense,
      xp: 0, level: 1, gold: 0,
      inventory: [{ id: 'health_potion', quantity: 1 }, { id: 'iron_sword', quantity: 1 }],
      equipped: { weapon: 'iron_sword' }, defending: false, alive: true
    },
    objectives: (def.objectives ?? []).map(o => ({ ...o })),
    turn: 0, status: 'PLAYING'
  };

  let n = 0;
  const id = (p: string) => `${p}-${++n}`;
  const enemyChars: Record<string, EnemyKind> = { G: 'goblin', S: 'skeleton' };
  const itemChars: Record<string, ItemId> = { H: 'health_potion', W: 'wooden_shield', K: 'dungeon_key' };
  let foundPlayer = false;

  for (let y = 0; y < height; y++) {
    const trow: Terrain[] = [];
    for (let x = 0; x < width; x++) {
      const ch = def.rows[y]![x]!;
      const pos = { x, y };
      let t: Terrain = 'FLOOR';
      if (ch === '#') t = 'WALL';
      else if (ch === 'X') t = 'EXIT';
      else if (ch === 'P') { state.player.pos = pos; foundPlayer = true; }
      else if (ch === 'D') state.doors.push({ id: id('door'), pos, state: 'CLOSED' });
      else if (ch === 'L') state.doors.push({ id: id('door'), pos, state: 'LOCKED' });
      else if (ch === 'C' || ch === 'c') {
        state.chests.push({
          id: id('chest'), pos, opened: false, locked: ch === 'c',
          loot: { gold: 75, items: [{ id: 'health_potion', quantity: 1 }] }
        });
      } else if (ch === 'T') state.traps.push({ id: id('trap'), pos, damage: TRAP_DAMAGE, triggered: false });
      else if (enemyChars[ch]) {
        const tpl = ENEMY_TEMPLATES[enemyChars[ch]!];
        state.enemies.push({
          id: id(tpl.kind), kind: tpl.kind, name: tpl.name, pos,
          health: tpl.health, maxHealth: tpl.health, attack: tpl.attack, defense: tpl.defense,
          xp: tpl.xp, gold: tpl.gold, aggroRange: tpl.aggroRange, alive: true
        });
      } else if (itemChars[ch]) state.items.push({ id: id('item'), pos, item: itemChars[ch]!, quantity: 1 });
      else if (ch !== '.') throw new Error(`Unknown level character '${ch}' at ${x},${y}`);
      trow.push(t);
    }
    state.terrain.push(trow);
    state.explored.push(new Array<boolean>(width).fill(false));
  }
  if (!foundPlayer) throw new Error('Level has no player start (P)');
  reveal(state);
  return state;
}

export function createGame(levelId: string = CRYPT_OF_ECHOES.id): GameState {
  const def = LEVELS[levelId];
  if (!def) throw new Error(`Unknown level: ${levelId}`);
  return parseLevel(def);
}

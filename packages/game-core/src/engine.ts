import type {
  AbsDirection, Action, ChestState, DoorState, EnemyState, ExecutionResult, GameCommand, GameEvent,
  GameState, InventoryItem, ItemId, StepResult, SystemCommandName, Vec2
} from '@dungeon/shared';
import { MAX_DISTANCE } from '@dungeon/shared';
import { ITEMS, resolveItemId, xpToNext } from './constants';
import {
  addDir, aliveEnemies, chestAt, describeOffset, directionBetween, doorAt, enemyAt, inBounds, isVisible,
  manhattan, opposite, reveal, samePos, trapAt
} from './grid';
import { findPath } from './pathfinding';

interface Ctx { events: GameEvent[]; messages: string[]; system: SystemCommandName[] }
interface R { ok: boolean; clarification?: string }
const OK: R = { ok: true };
const FAIL: R = { ok: false };

const GENERIC_WORDS = ['', 'enemy', 'enemies', 'monster', 'monsters', 'creature', 'foe', 'it', 'that', 'this', 'him', 'her', 'them', 'nearest', 'target'];
const DOOR_WORDS = ['door', 'doors', 'gate', 'doorway'];
const CHEST_WORDS = ['chest', 'chests', 'treasure', 'box', 'loot', 'coffer'];
const EXIT_WORDS = ['exit', 'stairs', 'portal', 'way out'];
const TRAP_WORDS = ['trap', 'traps', 'spikes', 'spike'];
const INFO_ACTIONS = new Set(['LOOK', 'LOCATE', 'STATUS', 'INVENTORY', 'QUEST', 'STOP', 'SYSTEM']);

const say = (c: Ctx, text: string) => { c.messages.push(text); };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const itemName = (id: ItemId) => ITEMS[id].name;

export function playerAttackValue(s: GameState): number {
  const w = s.player.equipped.weapon;
  return s.player.attack + (w ? ITEMS[w].attackBonus ?? 0 : 0);
}
export function playerDefenseValue(s: GameState): number {
  const a = s.player.equipped.armor;
  return s.player.defense + (a ? ITEMS[a].defenseBonus ?? 0 : 0);
}
export function inventoryCount(s: GameState, id: ItemId): number {
  return s.player.inventory.find(i => i.id === id)?.quantity ?? 0;
}
function addToInventory(inv: InventoryItem[], id: ItemId, qty: number): void {
  const found = inv.find(i => i.id === id);
  if (found) found.quantity += qty; else inv.push({ id, quantity: qty });
}
function removeFromInventory(s: GameState, id: ItemId, qty = 1): void {
  const inv = s.player.inventory;
  const idx = inv.findIndex(i => i.id === id);
  if (idx < 0) return;
  inv[idx]!.quantity -= qty;
  if (inv[idx]!.quantity <= 0) inv.splice(idx, 1);
  if (inventoryCount(s, id) === 0) {
    if (s.player.equipped.weapon === id) delete s.player.equipped.weapon;
    if (s.player.equipped.armor === id) delete s.player.equipped.armor;
  }
}

function completeObjective(s: GameState, c: Ctx, id: string): void {
  const o = s.objectives.find(x => x.id === id);
  if (!o || o.done) return;
  o.done = true;
  c.events.push({ kind: 'objective', id, text: o.text });
  say(c, `Objective complete: ${o.text}.`);
}

function damagePlayer(s: GameState, c: Ctx, amount: number): void {
  s.player.health = Math.max(0, s.player.health - amount);
  c.events.push({ kind: 'damage', target: 'player', amount });
  if (s.player.health === 0 && s.player.alive) {
    s.player.alive = false;
    s.status = 'DEAD';
    c.events.push({ kind: 'playerDied' });
    say(c, 'You have fallen in the dark. The dungeon claims another soul.');
  }
}

function gainXp(s: GameState, c: Ctx, xp: number): void {
  s.player.xp += xp;
  while (s.player.xp >= xpToNext(s.player.level)) {
    s.player.xp -= xpToNext(s.player.level);
    s.player.level++;
    s.player.maxHealth += 10;
    s.player.health = Math.min(s.player.maxHealth, s.player.health + 10);
    s.player.attack += 2;
    s.player.defense += 1;
    c.events.push({ kind: 'levelUp', level: s.player.level });
    say(c, `Level up! You are now level ${s.player.level}.`);
  }
}

/** Enemies act after each player turn. Returns total damage dealt to the player. */
function enemyPhase(s: GameState, c: Ctx): number {
  let total = 0;
  for (const e of s.enemies) {
    if (!e.alive || !s.player.alive) continue;
    const d = manhattan(e.pos, s.player.pos);
    if (d === 1) {
      let dmg = Math.max(1, e.attack - playerDefenseValue(s));
      if (s.player.defending) dmg = Math.ceil(dmg / 2);
      c.events.push({ kind: 'attack', attacker: e.id, target: 'player' });
      say(c, `The ${e.name} hits you for ${dmg}${s.player.defending ? ' (blocked!)' : ''}.`);
      damagePlayer(s, c, dmg);
      total += dmg;
    } else if (d <= e.aggroRange) {
      const path = findPath(s, e.pos, [s.player.pos], { actor: 'enemy', ignoreEnemyId: e.id, maxLength: e.aggroRange + 2 });
      if (path && path.length > 1) {
        const from = { ...e.pos };
        e.pos = { ...path[0]! };
        c.events.push({ kind: 'enemyMove', id: e.id, from, to: { ...e.pos } });
      }
    }
  }
  s.player.defending = false;
  return total;
}

function resolveDir(s: GameState, d: Action & { type: 'MOVE' }): AbsDirection {
  if (d.direction === 'FORWARD') return s.player.facing;
  if (d.direction === 'BACKWARD') return opposite(s.player.facing);
  return d.direction;
}

interface StepOutcome { moved: boolean; stop: boolean; reason?: string }

function stepPlayer(s: GameState, c: Ctx, dir: AbsDirection, careful: boolean): StepOutcome {
  if (s.player.facing !== dir) { s.player.facing = dir; c.events.push({ kind: 'face', direction: dir }); }
  const next = addDir(s.player.pos, dir);
  const bump = (reason: string): StepOutcome => { c.events.push({ kind: 'bump' }); return { moved: false, stop: true, reason }; };
  if (!inBounds(s, next) || s.terrain[next.y]![next.x] === 'WALL') return bump('A wall blocks the way.');
  const door = doorAt(s, next);
  if (door?.state === 'CLOSED') return bump('The door is closed. Say "open the door".');
  if (door?.state === 'LOCKED') return bump('The door is locked. You need a key.');
  if (chestAt(s, next)) return bump('The treasure chest is in the way.');
  const blocker = enemyAt(s, next);
  if (blocker) return bump(`The ${blocker.name} blocks your path.`);
  if (careful && trapAt(s, next)) return { moved: false, stop: true, reason: 'I stopped before the spike trap.' };

  const from = { ...s.player.pos };
  s.player.pos = next;
  s.turn++;
  c.events.push({ kind: 'move', from, to: { ...next }, direction: dir });
  reveal(s);

  const trap = trapAt(s, next);
  if (trap) {
    trap.triggered = true;
    c.events.push({ kind: 'trap', id: trap.id, amount: trap.damage });
    say(c, `Spikes shoot up! You take ${trap.damage} damage.`);
    damagePlayer(s, c, trap.damage);
    return { moved: true, stop: true, reason: 'The trap interrupted your movement.' };
  }
  if (s.terrain[next.y]![next.x] === 'EXIT') {
    s.status = 'WON';
    completeObjective(s, c, 'reach_exit');
    c.events.push({ kind: 'win' });
    say(c, 'You step through the portal. You escaped the dungeon!');
    return { moved: true, stop: true };
  }
  const dmg = enemyPhase(s, c);
  if (!s.player.alive) return { moved: true, stop: true };
  if (dmg > 0) return { moved: true, stop: true, reason: 'Enemies interrupted your movement.' };
  const adj = aliveEnemies(s).find(e => manhattan(e.pos, s.player.pos) === 1);
  if (adj) return { moved: true, stop: true, reason: `A ${adj.name} is right next to you!` };
  return { moved: true, stop: false };
}

function runMove(s: GameState, c: Ctx, a: Action & { type: 'MOVE' }): R {
  const dir = resolveDir(s, a);
  const dist = Math.max(1, Math.min(MAX_DISTANCE, Math.floor(a.distance)));
  let moved = 0;
  let reason = '';
  for (let i = 0; i < dist; i++) {
    const r = stepPlayer(s, c, dir, !!a.careful);
    if (r.moved) moved++;
    if (r.reason) reason = r.reason;
    if (!r.moved || r.stop) break;
  }
  const name = dir.toLowerCase();
  if (s.status === 'WON') return OK;
  if (moved === 0) { say(c, reason || `You can't move ${name}.`); return FAIL; }
  say(c, `You moved ${plural(moved, 'tile')} ${name}.${reason ? ' ' + reason : ''}`);
  return moved === dist ? OK : FAIL;
}

// ----- target resolution -----
interface TargetSet { label: string; positions: Vec2[]; solid: boolean }

function resolveTargets(s: GameState, raw: string): TargetSet | null {
  const t = raw.toLowerCase().trim();
  const exp = (p: Vec2) => s.explored[p.y]?.[p.x] === true;
  const enemyKinds = ['goblin', 'skeleton'];
  if (GENERIC_WORDS.includes(t) || enemyKinds.some(k => t.includes(k))) {
    const generic = GENERIC_WORDS.includes(t);
    const list = aliveEnemies(s).filter(e => exp(e.pos) && (generic || t.includes(e.kind)));
    return { label: generic ? 'enemy' : t, positions: list.map(e => e.pos), solid: true };
  }
  if (CHEST_WORDS.includes(t)) {
    const seen = s.chests.filter(x => exp(x.pos));
    const pending = seen.filter(x => !x.opened);
    return { label: 'treasure chest', positions: (pending.length ? pending : seen).map(x => x.pos), solid: true };
  }
  if (DOOR_WORDS.includes(t)) {
    // Prefer doors that still need opening; open ones only count once every door is open.
    const anyShut = s.doors.some(x => x.state !== 'OPEN');
    const list = s.doors.filter(x => exp(x.pos) && (!anyShut || x.state !== 'OPEN'));
    return { label: 'door', positions: list.map(x => x.pos), solid: true };
  }
  if (TRAP_WORDS.includes(t)) return { label: 'trap', positions: s.traps.filter(x => exp(x.pos)).map(x => x.pos), solid: true };
  if (EXIT_WORDS.includes(t)) {
    const out: Vec2[] = [];
    for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if (s.terrain[y]![x] === 'EXIT' && exp({ x, y })) out.push({ x, y });
    return { label: 'exit', positions: out, solid: false };
  }
  const id = resolveItemId(t);
  if (id) return { label: ITEMS[id].name.toLowerCase(), positions: s.items.filter(i => i.item === id && exp(i.pos)).map(i => i.pos), solid: false };
  return null;
}

function goalTiles(s: GameState, ts: TargetSet): Vec2[] {
  if (!ts.solid) return ts.positions;
  const out: Vec2[] = [];
  for (const p of ts.positions) for (const d of ['NORTH', 'SOUTH', 'EAST', 'WEST'] as AbsDirection[]) out.push(addDir(p, d));
  return out.filter(p => inBounds(s, p));
}

function runMoveTo(s: GameState, c: Ctx, a: Action & { type: 'MOVE_TO' }): R {
  const raw = (a.target ?? '').toLowerCase().trim();
  if (['', 'there', 'here'].includes(raw)) {
    say(c, 'Where would you like to go?');
    return { ok: false, clarification: 'Where would you like to go?' };
  }
  const ts = resolveTargets(s, raw);
  if (!ts) { say(c, `I don't know where "${raw}" is.`); return FAIL; }
  if (ts.positions.length === 0) { say(c, `You haven't discovered a ${ts.label} yet. Try exploring more.`); return FAIL; }
  const path = findPath(s, s.player.pos, goalTiles(s, ts), { actor: 'player', avoidTraps: true, maxLength: 80 });
  if (path === null) { say(c, `There is no clear path to the ${ts.label}. A closed door, trap or monster may be in the way.`); return FAIL; }
  if (path.length === 0) { say(c, `You are already at the ${ts.label}.`); return OK; }
  let moved = 0;
  let reason = '';
  for (const tile of path) {
    const dir = directionBetween(s.player.pos, tile)!;
    const r = stepPlayer(s, c, dir, true);
    if (r.moved) moved++;
    if (r.reason) reason = r.reason;
    if (!r.moved || r.stop) break;
  }
  if (s.status === 'WON') return OK;
  if (moved === path.length) {
    if (ts.solid) {
      const near = ts.positions.find(p => manhattan(p, s.player.pos) === 1);
      if (near) s.player.facing = directionBetween(s.player.pos, near) ?? s.player.facing;
    }
    say(c, `You reach the ${ts.label} (${plural(moved, 'step')}).`);
    return OK;
  }
  say(c, `You walked ${plural(moved, 'step')} toward the ${ts.label}. ${reason}`.trim());
  return FAIL;
}

// ----- combat -----
function matchEnemy(e: EnemyState, target: string | undefined): boolean {
  const t = (target ?? '').toLowerCase().trim();
  if (GENERIC_WORDS.includes(t)) return true;
  return t.includes(e.kind) || e.name.toLowerCase().includes(t);
}

function runAttack(s: GameState, c: Ctx, a: Action & { type: 'ATTACK' }): R {
  const named = aliveEnemies(s).filter(e => matchEnemy(e, a.target));
  const wantsSpecific = !GENERIC_WORDS.includes((a.target ?? '').toLowerCase().trim());
  if (wantsSpecific && named.length === 0) { say(c, `There is no ${a.target} here.`); return FAIL; }
  const inReach = named.filter(e => manhattan(e.pos, s.player.pos) === 1);
  if (inReach.length === 0) {
    const nearest = [...named].sort((p, q) => manhattan(p.pos, s.player.pos) - manhattan(q.pos, s.player.pos))[0];
    if (nearest && isVisible(s, nearest.pos)) {
      say(c, `The ${nearest.name} is ${plural(manhattan(nearest.pos, s.player.pos), 'tile')} away. Move closer first.`);
    } else say(c, 'There is nothing within reach to attack.');
    return FAIL;
  }
  const kinds = new Set(inReach.map(e => e.kind));
  if (!wantsSpecific && kinds.size > 1) {
    const q = `Which enemy: ${[...kinds].join(' or ')}?`;
    say(c, q);
    return { ok: false, clarification: q };
  }
  const e = inReach[0]!;
  const dir = directionBetween(s.player.pos, e.pos);
  if (dir && s.player.facing !== dir) { s.player.facing = dir; c.events.push({ kind: 'face', direction: dir }); }
  const dmg = Math.max(1, playerAttackValue(s) - e.defense);
  e.health = Math.max(0, e.health - dmg);
  s.turn++;
  c.events.push({ kind: 'attack', attacker: 'player', target: e.id });
  c.events.push({ kind: 'damage', target: e.id, amount: dmg });
  say(c, `You hit the ${e.name} for ${dmg}.`);
  if (e.health === 0) {
    e.alive = false;
    s.player.gold += e.gold;
    c.events.push({ kind: 'enemyDefeated', id: e.id, xp: e.xp, gold: e.gold });
    say(c, `The ${e.name} is defeated! +${e.xp} XP, +${e.gold} gold.`);
    if (e.kind === 'skeleton') completeObjective(s, c, 'defeat_skeleton');
    gainXp(s, c, e.xp);
  }
  enemyPhase(s, c);
  return OK;
}

function runDefend(s: GameState, c: Ctx): R {
  s.player.defending = true;
  s.turn++;
  c.events.push({ kind: 'defend' });
  say(c, 'You raise your guard.');
  enemyPhase(s, c);
  return OK;
}

// ----- interaction -----
interface Interactable { kind: 'door' | 'chest'; pos: Vec2; door?: DoorState; chest?: ChestState }

function interactables(s: GameState): Interactable[] {
  return [
    ...s.doors.map(d => ({ kind: 'door' as const, pos: d.pos, door: d })),
    ...s.chests.map(ch => ({ kind: 'chest' as const, pos: ch.pos, chest: ch }))
  ];
}

function runInteract(s: GameState, c: Ctx, a: Action & { type: 'INTERACT' }): R {
  const t = (a.target ?? '').toLowerCase().trim();
  let want: 'door' | 'chest' | 'any';
  if (DOOR_WORDS.includes(t)) want = 'door';
  else if (CHEST_WORDS.includes(t)) want = 'chest';
  else if (GENERIC_WORDS.includes(t)) want = 'any';
  else { say(c, `There is no ${t} here.`); return FAIL; }

  const all = interactables(s).filter(i => want === 'any' || i.kind === want);
  const near = all.filter(i => manhattan(i.pos, s.player.pos) <= 1);
  if (near.length === 0) {
    const nearest = [...all].filter(i => s.explored[i.pos.y]?.[i.pos.x]).sort((p, q) => manhattan(p.pos, s.player.pos) - manhattan(q.pos, s.player.pos))[0];
    if (nearest) say(c, `The ${nearest.kind} is ${plural(manhattan(nearest.pos, s.player.pos), 'tile')} away. Move next to it first.`);
    else say(c, want === 'any' ? 'There is nothing here to interact with.' : `There is no ${want} nearby.`);
    return FAIL;
  }
  const kinds = new Set(near.map(i => i.kind));
  if (want === 'any' && kinds.size > 1) {
    const q = 'Do you mean the door or the chest?';
    say(c, q);
    return { ok: false, clarification: q };
  }
  const target = near[0]!;
  const dir = directionBetween(s.player.pos, target.pos);
  if (dir && s.player.facing !== dir) { s.player.facing = dir; c.events.push({ kind: 'face', direction: dir }); }

  if (target.door) {
    const d = target.door;
    if (d.state === 'OPEN') { say(c, 'The door is already open.'); return FAIL; }
    if (d.state === 'LOCKED') {
      if (inventoryCount(s, 'dungeon_key') === 0) { say(c, 'The door is locked. You need a key.'); return FAIL; }
      removeFromInventory(s, 'dungeon_key');
      say(c, 'You unlock the door with the Dungeon Key.');
    } else say(c, 'You push the door open.');
    d.state = 'OPEN';
    c.events.push({ kind: 'door', id: d.id, state: 'OPEN' });
  } else if (target.chest) {
    const ch = target.chest;
    if (ch.opened) { say(c, 'The chest is already empty.'); return FAIL; }
    if (ch.locked) {
      if (inventoryCount(s, 'dungeon_key') === 0) { say(c, 'The chest is locked. You need a key.'); return FAIL; }
      removeFromInventory(s, 'dungeon_key');
      ch.locked = false;
      say(c, 'You unlock the chest with the Dungeon Key.');
    }
    ch.opened = true;
    s.player.gold += ch.loot.gold;
    const names: string[] = [];
    for (const it of ch.loot.items) { addToInventory(s.player.inventory, it.id, it.quantity); names.push(`${it.quantity}× ${itemName(it.id)}`); }
    c.events.push({ kind: 'chest', id: ch.id, gold: ch.loot.gold });
    say(c, `You open the chest: +${ch.loot.gold} gold${names.length ? ', ' + names.join(', ') : ''}.`);
    completeObjective(s, c, 'open_chest');
  }
  s.turn++;
  enemyPhase(s, c);
  return OK;
}

function runCollect(s: GameState, c: Ctx, a: Action & { type: 'COLLECT' }): R {
  const t = (a.target ?? '').toLowerCase().trim();
  const generic = GENERIC_WORDS.includes(t);
  const id = generic ? undefined : resolveItemId(t);
  if (!generic && !id) { say(c, `I don't see any "${t}" to pick up.`); return FAIL; }
  const matching = s.items.filter(i => generic || i.item === id);
  const near = matching.filter(i => manhattan(i.pos, s.player.pos) <= 1);
  if (near.length === 0) {
    const far = matching.filter(i => s.explored[i.pos.y]?.[i.pos.x])
      .sort((p, q) => manhattan(p.pos, s.player.pos) - manhattan(q.pos, s.player.pos))[0];
    if (far) say(c, `The ${itemName(far.item)} is ${plural(manhattan(far.pos, s.player.pos), 'tile')} away. Move closer first.`);
    else say(c, generic ? 'There is nothing here to pick up.' : `There is no ${itemName(id!)} here.`);
    return FAIL;
  }
  const distinct = new Set(near.map(i => i.item));
  if (generic && distinct.size > 1) {
    const q = `Which item: ${[...distinct].map(itemName).join(' or ')}?`;
    say(c, q);
    return { ok: false, clarification: q };
  }
  const g = [...near].sort((p, q) => manhattan(p.pos, s.player.pos) - manhattan(q.pos, s.player.pos))[0]!;
  s.items = s.items.filter(i => i.id !== g.id);
  addToInventory(s.player.inventory, g.item, g.quantity);
  c.events.push({ kind: 'pickup', id: g.id, item: g.item });
  say(c, `You pick up the ${itemName(g.item)}.`);
  if (g.item === 'dungeon_key') completeObjective(s, c, 'get_key');
  s.turn++;
  enemyPhase(s, c);
  return OK;
}

function runUseItem(s: GameState, c: Ctx, a: Action & { type: 'USE_ITEM' }): R {
  const id = resolveItemId(a.item);
  if (!id) { say(c, `You don't have "${a.item}".`); return FAIL; }
  const def = ITEMS[id];
  if (inventoryCount(s, id) === 0) { say(c, `You don't have a ${def.name}.`); return FAIL; }
  if (def.kind === 'weapon' || def.kind === 'armor') return runEquip(s, c, { type: 'EQUIP_ITEM', item: id });
  if (def.kind === 'key') {
    const doors = s.doors.filter(d => d.state === 'LOCKED' && manhattan(d.pos, s.player.pos) <= 1);
    const chest = s.chests.filter(ch => ch.locked && !ch.opened && manhattan(ch.pos, s.player.pos) <= 1);
    if (doors.length + chest.length === 0) { say(c, 'There is nothing here to use the key on.'); return FAIL; }
    return runInteract(s, c, { type: 'INTERACT', target: doors.length ? 'door' : 'chest' });
  }
  if (s.player.health >= s.player.maxHealth) { say(c, 'You are already at full health.'); return FAIL; }
  const amount = Math.min(def.heal ?? 0, s.player.maxHealth - s.player.health);
  s.player.health += amount;
  removeFromInventory(s, id);
  s.turn++;
  c.events.push({ kind: 'heal', amount });
  say(c, `You drink a ${def.name} and recover ${amount} health.`);
  enemyPhase(s, c);
  return OK;
}

function runEquip(s: GameState, c: Ctx, a: Action & { type: 'EQUIP_ITEM' }): R {
  const id = resolveItemId(a.item);
  if (!id) { say(c, `You don't have "${a.item}".`); return FAIL; }
  const def = ITEMS[id];
  if (inventoryCount(s, id) === 0) { say(c, `You don't have a ${def.name}.`); return FAIL; }
  if (def.kind === 'weapon') s.player.equipped.weapon = id;
  else if (def.kind === 'armor') s.player.equipped.armor = id;
  else { say(c, `You can't equip the ${def.name}.`); return FAIL; }
  c.events.push({ kind: 'equip', item: id });
  say(c, `You equip the ${def.name}.`);
  return OK;
}

function runDrop(s: GameState, c: Ctx, a: Action & { type: 'DROP_ITEM' }): R {
  const id = resolveItemId(a.item);
  if (!id || inventoryCount(s, id) === 0) { say(c, `You don't have ${id ? 'a ' + itemName(id) : `"${a.item}"`} to drop.`); return FAIL; }
  removeFromInventory(s, id);
  const here = s.items.find(i => i.item === id && samePos(i.pos, s.player.pos));
  if (here) here.quantity++;
  else s.items.push({ id: `drop-${s.turn}-${id}`, pos: { ...s.player.pos }, item: id, quantity: 1 });
  c.events.push({ kind: 'drop', item: id });
  say(c, `You drop the ${itemName(id)}.`);
  return OK;
}

// ----- information -----
function runLook(s: GameState, c: Ctx): R {
  const from = s.player.pos;
  const parts: string[] = [];
  const seen = (p: Vec2) => isVisible(s, p) && s.explored[p.y]?.[p.x];
  for (const e of aliveEnemies(s)) if (seen(e.pos)) parts.push(`a ${e.name} (${e.health}/${e.maxHealth} HP) ${describeOffset(from, e.pos)}`);
  for (const ch of s.chests) if (seen(ch.pos)) parts.push(`a ${ch.opened ? 'empty' : ch.locked ? 'locked' : 'closed'} chest ${describeOffset(from, ch.pos)}`);
  for (const d of s.doors) if (seen(d.pos)) parts.push(`a ${d.state.toLowerCase()} door ${describeOffset(from, d.pos)}`);
  for (const i of s.items) if (seen(i.pos)) parts.push(`a ${itemName(i.item)} ${describeOffset(from, i.pos)}`);
  for (const t of s.traps) if (seen(t.pos)) parts.push(`a spike trap ${describeOffset(from, t.pos)}`);
  for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) if (s.terrain[y]![x] === 'EXIT' && seen({ x, y })) parts.push(`the exit portal ${describeOffset(from, { x, y })}`);
  say(c, parts.length ? `You see: ${parts.join('; ')}.` : 'You see only cold stone around you.');
  return OK;
}

function runLocate(s: GameState, c: Ctx, a: Action & { type: 'LOCATE' }): R {
  const ts = resolveTargets(s, a.target);
  if (!ts) { say(c, `I don't know what "${a.target}" is.`); return FAIL; }
  const nearest = [...ts.positions].sort((p, q) => manhattan(p, s.player.pos) - manhattan(q, s.player.pos))[0];
  if (!nearest) { say(c, `You haven't discovered a ${ts.label} yet.`); return FAIL; }
  say(c, `The ${ts.label} is ${describeOffset(s.player.pos, nearest)} of you.`);
  return OK;
}

function runStatus(s: GameState, c: Ctx, q: string): R {
  const p = s.player;
  const nearby = aliveEnemies(s).filter(e => isVisible(s, e.pos));
  switch (q) {
    case 'HEALTH': say(c, `Health: ${p.health}/${p.maxHealth}.`); break;
    case 'GOLD': say(c, `You carry ${p.gold} gold.`); break;
    case 'LEVEL': say(c, `Level ${p.level}, ${p.xp}/${xpToNext(p.level)} XP.`); break;
    case 'ENEMIES':
      say(c, nearby.length ? `${plural(nearby.length, 'enemy')} nearby: ${nearby.map(e => `${e.name} (${e.health} HP)`).join(', ')}.` : 'No enemies nearby.');
      break;
    default:
      say(c, `Level ${p.level} · Health ${p.health}/${p.maxHealth} · Gold ${p.gold} · XP ${p.xp}/${xpToNext(p.level)}.`);
  }
  return OK;
}

function runInventory(s: GameState, c: Ctx): R {
  const p = s.player;
  if (p.inventory.length === 0) { say(c, 'Your pack is empty.'); return OK; }
  const list = p.inventory.map(i => {
    const eq = p.equipped.weapon === i.id || p.equipped.armor === i.id ? ' (equipped)' : '';
    return `${i.quantity}× ${itemName(i.id)}${eq}`;
  });
  say(c, `Inventory: ${list.join(', ')}.`);
  return OK;
}

function runQuest(s: GameState, c: Ctx): R {
  const next = s.objectives.find(o => !o.done);
  const done = s.objectives.filter(o => o.done).map(o => o.text);
  if (!next) say(c, 'All objectives are complete.');
  else say(c, `Objective: ${next.text}. Hint: ${next.hint}${done.length ? ` Completed: ${done.join('; ')}.` : ''}`);
  return OK;
}

// ----- dispatcher -----
function runAction(s: GameState, c: Ctx, a: Action): R {
  if (s.status !== 'PLAYING' && !INFO_ACTIONS.has(a.type)) {
    say(c, s.status === 'WON' ? 'The adventure is complete. Start a new game to play again.' : 'You are dead. Start a new game to try again.');
    return FAIL;
  }
  switch (a.type) {
    case 'MOVE': return runMove(s, c, a);
    case 'MOVE_TO': return runMoveTo(s, c, a);
    case 'ATTACK': return runAttack(s, c, a);
    case 'DEFEND': return runDefend(s, c);
    case 'CAST': say(c, 'You have not learned any spells yet. Try attacking with your sword.'); return FAIL;
    case 'INTERACT': return runInteract(s, c, a);
    case 'COLLECT': return runCollect(s, c, a);
    case 'USE_ITEM': return runUseItem(s, c, a);
    case 'EQUIP_ITEM': return runEquip(s, c, a);
    case 'DROP_ITEM': return runDrop(s, c, a);
    case 'LOOK': return runLook(s, c);
    case 'LOCATE': return runLocate(s, c, a);
    case 'STATUS': return runStatus(s, c, a.query);
    case 'INVENTORY': return runInventory(s, c);
    case 'QUEST': return runQuest(s, c);
    case 'STOP': say(c, 'You stand still.'); return OK;
    case 'SYSTEM': c.system.push(a.command); return OK;
    default: { const _never: never = a; void _never; say(c, 'Unsupported action.'); return FAIL; }
  }
}

/** Runs an ordered action list on a copy of `state`. Stops at the first failing action. */
export function executeActions(state: GameState, actions: Action[]): ExecutionResult {
  const s: GameState = structuredClone(state);
  const c: Ctx = { events: [], messages: [], system: [] };
  const steps: StepResult[] = [];
  let ok = true;
  let clarification: string | undefined;
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]!;
    const before = c.messages.length;
    const r = runAction(s, c, action);
    steps.push({ action, ok: r.ok, message: c.messages.slice(before).join(' ') });
    if (r.clarification) clarification = r.clarification;
    if (!r.ok) {
      ok = false;
      if (i < actions.length - 1) say(c, 'The rest of your command was not carried out.');
      break;
    }
    if (s.status !== 'PLAYING') break;
  }
  return { state: s, ok, steps, messages: c.messages, events: c.events, clarification, system: c.system };
}

export function executeCommand(state: GameState, command: GameCommand): ExecutionResult {
  return executeActions(state, command.actions);
}

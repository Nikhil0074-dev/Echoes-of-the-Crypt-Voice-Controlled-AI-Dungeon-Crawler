import { describe, expect, it } from 'vitest';
import { executeCommand, createGame, playerAttackValue } from '../src';
import { level, run, revealAll } from './helpers';

describe('combat', () => {
  const arena = ['#######', '#PG...#', '#######'];

  it('computes damage as attack minus defense (min 1)', () => {
    const s = level(arena);
    expect(playerAttackValue(s)).toBe(14); // 10 + sword 4
    const r = run(s, { type: 'ATTACK', target: 'goblin' });
    expect(r.state.enemies[0]!.health).toBe(20 - (14 - 1));
    expect(r.messages[0]).toMatch(/hit the Goblin for 13/);
  });

  it('enemy counter-attacks using its attack minus player defense', () => {
    const r = run(level(arena), { type: 'ATTACK', target: 'goblin' });
    expect(r.state.player.health).toBe(100 - (6 - 2));
  });

  it('kills, awards xp and gold, and does not counter-attack the dead', () => {
    let r = run(level(arena), { type: 'ATTACK', target: 'goblin' }, { type: 'ATTACK', target: 'goblin' });
    expect(r.state.enemies[0]!.alive).toBe(false);
    expect(r.state.player.xp).toBe(20);
    expect(r.state.player.gold).toBe(10);
    expect(r.state.player.health).toBe(96); // only the first counter-attack
    r = run(r.state, { type: 'ATTACK', target: 'goblin' });
    expect(r.ok).toBe(false);
  });

  it('levels up when xp threshold is reached', () => {
    const s = level(arena);
    s.player.xp = 40;
    const r = run(s, { type: 'ATTACK' }, { type: 'ATTACK' });
    expect(r.state.player.level).toBe(2);
    expect(r.state.player.maxHealth).toBe(110);
    expect(r.events.some(e => e.kind === 'levelUp')).toBe(true);
  });

  it('refuses to attack enemies out of reach and says how far', () => {
    const r = run(level(['#######', '#P..G.#', '#######']), { type: 'ATTACK', target: 'goblin' });
    expect(r.ok).toBe(false);
    expect(r.messages[0]).toMatch(/3 tiles away/);
  });

  it('reports a missing target', () => {
    const r = run(level(['#####', '#P..#', '#####']), { type: 'ATTACK', target: 'skeleton' });
    expect(r.messages[0]).toMatch(/no skeleton/);
    expect(run(level(['#####', '#P..#', '#####']), { type: 'ATTACK' }).messages[0]).toMatch(/nothing within reach/);
  });

  it('asks which enemy when several kinds are adjacent', () => {
    const r = run(level(['#####', '#GPS#', '#####']), { type: 'ATTACK' });
    expect(r.ok).toBe(false);
    expect(r.clarification).toMatch(/goblin or skeleton/);
    expect(r.state.enemies.every(e => e.health === e.maxHealth)).toBe(true);
  });

  it('defending halves incoming damage', () => {
    const s = level(['#####', '#PS.#', '#####']);
    const normal = run(s, { type: 'ATTACK' }).state.player.health;
    const guarded = run(s, { type: 'DEFEND' }).state.player.health;
    expect(100 - guarded).toBe(Math.ceil((100 - normal) / 2));
  });

  it('enemies chase the player within aggro range', () => {
    const s = level(['#########', '#P...G..#', '#########']);
    const r = run(s, { type: 'STOP' });
    expect(r.state.enemies[0]!.pos.x).toBe(5); // STOP takes no turn
    const r2 = run(s, { type: 'DEFEND' });
    expect(r2.state.enemies[0]!.pos.x).toBe(4);
    expect(r2.events.some(e => e.kind === 'enemyMove')).toBe(true);
  });

  it('movement is interrupted when an enemy becomes adjacent', () => {
    const s = level(['#########', '#P...G..#', '#########']);
    const r = run(s, { type: 'MOVE', direction: 'EAST', distance: 6 });
    expect(r.ok).toBe(false);
    expect(r.messages.join(' ')).toMatch(/right next to you|interrupted|blocks/);
    expect(r.state.player.pos.x).toBeLessThan(5);
  });

  it('the player can die and then commands are rejected', () => {
    const s = level(['#####', '#PS.#', '#####']);
    s.player.health = 1;
    const r = run(s, { type: 'DEFEND' });
    expect(r.state.status).toBe('DEAD');
    expect(r.state.player.alive).toBe(false);
    const again = run(r.state, { type: 'MOVE', direction: 'EAST', distance: 1 });
    expect(again.ok).toBe(false);
    expect(again.messages[0]).toMatch(/dead/);
    expect(run(r.state, { type: 'STATUS', query: 'HEALTH' }).ok).toBe(true);
  });

  it('spells are not available yet', () => {
    expect(run(level(['###', '#P#', '###']), { type: 'CAST', spell: 'fire' }).ok).toBe(false);
  });
});

describe('interaction and inventory', () => {
  it('opens a plain door when adjacent', () => {
    const r = run(level(['#####', '#PD.#', '#####']), { type: 'INTERACT', target: 'door' });
    expect(r.ok).toBe(true);
    expect(r.state.doors[0]!.state).toBe('OPEN');
    const walk = run(r.state, { type: 'MOVE', direction: 'EAST', distance: 3 });
    expect(walk.state.player.pos.x).toBe(3);
  });

  it('locked door needs a key and consumes it', () => {
    const s = level(['######', '#PLK.#', '######']);
    expect(run(s, { type: 'INTERACT', target: 'door' }).messages[0]).toMatch(/need a key/);
    s.player.inventory.push({ id: 'dungeon_key', quantity: 1 });
    const r = run(s, { type: 'INTERACT', target: 'door' });
    expect(r.ok).toBe(true);
    expect(r.state.doors[0]!.state).toBe('OPEN');
    expect(r.state.player.inventory.find(i => i.id === 'dungeon_key')).toBeUndefined();
  });

  it('opening a chest pays gold and items and completes its objective', () => {
    const s = level(['#####', '#PC.#', '#####']);
    s.objectives = [{ id: 'open_chest', text: 'Open it', hint: '', done: false }];
    const r = run(s, { type: 'INTERACT', target: 'chest' });
    expect(r.state.player.gold).toBe(75);
    expect(r.state.player.inventory.find(i => i.id === 'health_potion')!.quantity).toBe(2);
    expect(r.state.objectives[0]!.done).toBe(true);
    expect(run(r.state, { type: 'INTERACT', target: 'chest' }).messages[0]).toMatch(/already empty/);
  });

  it('locked chest says so without a key (scenario 3)', () => {
    const r = run(level(['#####', '#Pc.#', '#####']), { type: 'INTERACT', target: 'treasure' });
    expect(r.ok).toBe(false);
    expect(r.messages[0]).toBe('The chest is locked. You need a key.');
  });

  it('tells the player when the object is too far', () => {
    const s = revealAll(level(['#######', '#P...C#', '#######']));
    expect(run(s, { type: 'INTERACT', target: 'chest' }).messages[0]).toMatch(/4 tiles away/);
  });

  it('asks which object when door and chest are both adjacent', () => {
    const r = run(level(['#####', '#CPD#', '#####']), { type: 'INTERACT' });
    expect(r.clarification).toMatch(/door or the chest/);
  });

  it('rejects unknown interactables', () => {
    expect(run(level(['###', '#P#', '###']), { type: 'INTERACT', target: 'lever' }).messages[0]).toMatch(/no lever/);
  });

  it('collects items, key completes the objective', () => {
    const s = level(['#####', '#PK.#', '#####']);
    s.objectives = [{ id: 'get_key', text: 'Key', hint: '', done: false }];
    const r = run(s, { type: 'COLLECT', target: 'key' });
    expect(r.ok).toBe(true);
    expect(r.state.items).toHaveLength(0);
    expect(r.state.objectives[0]!.done).toBe(true);
  });

  it('collect without a target asks when two items are adjacent', () => {
    const r = run(level(['#####', '#KPH#', '#####']), { type: 'COLLECT' });
    expect(r.clarification).toMatch(/Which item/);
  });

  it('collect fails when item is far or missing', () => {
    const s = revealAll(level(['#######', '#P...K#', '#######']));
    expect(run(s, { type: 'COLLECT', target: 'key' }).messages[0]).toMatch(/4 tiles away/);
    expect(run(s, { type: 'COLLECT', target: 'potion' }).messages[0]).toMatch(/no Health Potion/);
    expect(run(s, { type: 'COLLECT', target: 'banana' }).ok).toBe(false);
  });

  it('uses a health potion, caps at max, and refuses at full health', () => {
    const s = level(['###', '#P#', '###']);
    expect(run(s, { type: 'USE_ITEM', item: 'potion' }).messages[0]).toMatch(/full health/);
    s.player.health = 70;
    const r = run(s, { type: 'USE_ITEM', item: 'health_potion' });
    expect(r.state.player.health).toBe(100);
    expect(r.messages[0]).toMatch(/recover 30/);
    expect(r.state.player.inventory.find(i => i.id === 'health_potion')).toBeUndefined();
    expect(run(r.state, { type: 'USE_ITEM', item: 'potion' }).messages[0]).toMatch(/don't have/);
  });

  it('equips the shield and it reduces damage', () => {
    const s = level(['#####', '#PG.#', '#####']);
    s.player.inventory.push({ id: 'wooden_shield', quantity: 1 });
    const eq = run(s, { type: 'EQUIP_ITEM', item: 'shield' });
    expect(eq.state.player.equipped.armor).toBe('wooden_shield');
    const hit = run(eq.state, { type: 'DEFEND' }); // goblin 6 - (2+2) = 2, halved = 1
    expect(hit.state.player.health).toBe(99);
    expect(run(s, { type: 'EQUIP_ITEM', item: 'potion' }).ok).toBe(false);
  });

  it('drops an item onto the floor and can pick it back up', () => {
    const s = level(['###', '#P#', '###']);
    s.player.inventory.push({ id: 'wooden_shield', quantity: 1 });
    s.player.equipped.armor = 'wooden_shield';
    const d = run(s, { type: 'DROP_ITEM', item: 'shield' });
    expect(d.state.player.equipped.armor).toBeUndefined();
    expect(d.state.items).toHaveLength(1);
    const back = run(d.state, { type: 'COLLECT', target: 'shield' });
    expect(back.state.player.inventory.some(i => i.id === 'wooden_shield')).toBe(true);
    expect(run(s, { type: 'DROP_ITEM', item: 'banana' }).ok).toBe(false);
  });

  it('using the key item opens an adjacent locked door', () => {
    const s = level(['####', '#PL#', '####']);
    s.player.inventory.push({ id: 'dungeon_key', quantity: 1 });
    expect(run(s, { type: 'USE_ITEM', item: 'key' }).state.doors[0]!.state).toBe('OPEN');
    expect(run(level(['###', '#P#', '###']), { type: 'USE_ITEM', item: 'key' }).ok).toBe(false);
  });
});

describe('information commands', () => {
  it('reports status values', () => {
    const s = createGame();
    expect(run(s, { type: 'STATUS', query: 'HEALTH' }).messages[0]).toBe('Health: 100/100.');
    expect(run(s, { type: 'STATUS', query: 'GOLD' }).messages[0]).toMatch(/0 gold/);
    expect(run(s, { type: 'STATUS', query: 'LEVEL' }).messages[0]).toMatch(/Level 1/);
    expect(run(s, { type: 'STATUS', query: 'ENEMIES' }).messages[0]).toMatch(/No enemies nearby/);
    expect(run(s, { type: 'STATUS', query: 'ALL' }).messages[0]).toMatch(/Health 100/);
  });

  it('lists inventory with equipment and handles empty packs', () => {
    const s = createGame();
    expect(run(s, { type: 'INVENTORY' }).messages[0]).toMatch(/Iron Sword \(equipped\)/);
    s.player.inventory = [];
    expect(run(s, { type: 'INVENTORY' }).messages[0]).toMatch(/empty/);
  });

  it('describes objectives and progress', () => {
    const s = createGame();
    expect(run(s, { type: 'QUEST' }).messages[0]).toMatch(/Find the dungeon key/);
    s.objectives.forEach(o => (o.done = true));
    expect(run(s, { type: 'QUEST' }).messages[0]).toMatch(/complete/);
  });

  it('look only reports what the torch can reveal', () => {
    const r = run(createGame(), { type: 'LOOK' });
    expect(r.messages[0]).toMatch(/Wooden Shield/);
    expect(r.messages[0]).toMatch(/Health Potion/);
    expect(r.messages[0]).not.toMatch(/Skeleton/);
  });

  it('locate respects fog of war', () => {
    const s = createGame();
    expect(run(s, { type: 'LOCATE', target: 'key' }).messages[0]).toMatch(/haven't discovered/);
    expect(run(s, { type: 'LOCATE', target: 'potion' }).messages[0]).toMatch(/south/);
    expect(run(s, { type: 'LOCATE', target: 'unicorn' }).ok).toBe(false);
  });

  it('system actions pass through to the caller without changing state', () => {
    const s = createGame();
    const r = run(s, { type: 'SYSTEM', command: 'SAVE' });
    expect(r.system).toEqual(['SAVE']);
    expect(r.state).toEqual(s);
  });
});

describe('command sequences', () => {
  it('aborts the remaining actions after a failure (scenario 5)', () => {
    const s = level(['######', '#P.#.#', '#D...#', '######']);
    const r = executeCommand(s, {
      commandId: 'c', transcript: '', intent: 'SEQUENCE', confidence: 1, requiresConfirmation: false,
      actions: [{ type: 'MOVE', direction: 'EAST', distance: 3 }, { type: 'INTERACT', target: 'door' }]
    });
    expect(r.ok).toBe(false);
    expect(r.steps).toHaveLength(1);
    expect(r.messages.at(-1)).toMatch(/rest of your command was not carried out/);
    expect(r.state.doors[0]!.state).toBe('CLOSED');
  });

  it('runs every step when all succeed', () => {
    const s = level(['######', '#P.D.#', '######']);
    const r = run(s, { type: 'MOVE', direction: 'EAST', distance: 1 }, { type: 'INTERACT', target: 'door' });
    expect(r.ok).toBe(true);
    expect(r.steps).toHaveLength(2);
    expect(r.state.doors[0]!.state).toBe('OPEN');
  });
});

describe('full playthrough of the Crypt of Echoes', () => {
  it('can be completed with the documented command flow', () => {
    let s = createGame();
    const step = (...a: Parameters<typeof run>[1][]) => { const r = run(s, ...a); s = r.state; return r; };

    step({ type: 'MOVE_TO', target: 'shield' });
    expect(step({ type: 'COLLECT', target: 'shield' }).ok).toBe(true);
    step({ type: 'EQUIP_ITEM', item: 'shield' });
    expect(step({ type: 'MOVE_TO', target: 'door' }).ok).toBe(true);
    expect(step({ type: 'INTERACT', target: 'door' }).ok).toBe(true);

    // walk into the goblin chamber and fight
    let guard = 0;
    while (s.enemies.find(e => e.kind === 'goblin')!.alive && guard++ < 20) {
      const r = step({ type: 'MOVE', direction: 'EAST', distance: 1 });
      if (!r.ok && s.enemies[0]!.alive) step({ type: 'ATTACK', target: 'goblin' });
    }
    expect(s.player.alive).toBe(true);
    expect(s.enemies.find(e => e.kind === 'goblin')!.alive).toBe(false);

    expect(step({ type: 'MOVE_TO', target: 'key' }).ok).toBe(true);
    expect(step({ type: 'COLLECT', target: 'key' }).ok).toBe(true);
    expect(step({ type: 'MOVE_TO', target: 'door' }).ok).toBe(false); // locked door not discovered yet
    step({ type: 'MOVE', direction: 'EAST', distance: 3 });
    expect(step({ type: 'MOVE_TO', target: 'door' }).ok).toBe(true);
    const unlock = step({ type: 'INTERACT', target: 'door' });
    expect(unlock.ok).toBe(true);
    expect(s.objectives.find(o => o.id === 'get_key')!.done).toBe(true);

    // into the east room, open the chest, then down to the skeleton hall and the exit
    expect(step({ type: 'MOVE_TO', target: 'chest' }).ok).toBe(true);
    expect(step({ type: 'INTERACT', target: 'chest' }).ok).toBe(true);
    expect(s.objectives.find(o => o.id === 'open_chest')!.done).toBe(true);
    expect(s.player.gold).toBeGreaterThanOrEqual(75);

    // drink potions as needed and kill the skeleton as it approaches
    let loops = 0;
    while (s.enemies.find(e => e.kind === 'skeleton')!.alive && s.player.alive && loops++ < 60) {
      if (s.player.health < 45 && s.player.inventory.some(i => i.id === 'health_potion')) { step({ type: 'USE_ITEM', item: 'potion' }); continue; }
      const sk = s.enemies.find(e => e.kind === 'skeleton')!;
      const d = Math.abs(sk.pos.x - s.player.pos.x) + Math.abs(sk.pos.y - s.player.pos.y);
      if (d === 1) step({ type: 'ATTACK', target: 'skeleton' });
      else if (s.explored[sk.pos.y]![sk.pos.x]) step({ type: 'MOVE_TO', target: 'skeleton' });
      else step({ type: 'MOVE_TO', target: 'exit' });
      if (s.status === 'WON') break;
    }
    expect(s.player.alive).toBe(true);
  });
});

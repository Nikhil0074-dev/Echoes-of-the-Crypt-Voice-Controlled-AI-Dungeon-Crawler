import { describe, expect, it } from 'vitest';
import type { Action } from '@dungeon/shared';
import { normalizeText, parseLocal, stripFiller } from '../src';

const acts = (t: string, ctx = {}) => parseLocal(t, ctx).actions;

describe('normalizeText / stripFiller', () => {
  it('converts number words and punctuation', () => {
    expect(normalizeText('Move THREE steps, north!')).toBe('move 3 steps, north');
    expect(normalizeText('go east twice')).toBe('go east 2 times');
    expect(normalizeText('walk to steps left')).toBe('walk 2 steps left');
    expect(normalizeText('a couple of tiles')).toBe('2 tiles');
  });
  it('strips polite filler', () => {
    expect(stripFiller('please move north')).toBe('move north');
    expect(stripFiller('hey dungeon, attack the goblin')).toBe('attack the goblin');
    expect(stripFiller("i'd like to open the door")).toBe('open the door');
  });
});

describe('movement phrasing', () => {
  const cases: [string, Action][] = [
    ['Move north.', { type: 'MOVE', direction: 'NORTH', distance: 1 }],
    ['Go three steps left', { type: 'MOVE', direction: 'WEST', distance: 3 }],
    ['Move three steps north', { type: 'MOVE', direction: 'NORTH', distance: 3 }],
    ['Walk two tiles to the left', { type: 'MOVE', direction: 'WEST', distance: 2 }],
    ['Take three steps north', { type: 'MOVE', direction: 'NORTH', distance: 3 }],
    ['Take one step ahead', { type: 'MOVE', direction: 'FORWARD', distance: 1 }],
    ['Walk towards the top', { type: 'MOVE', direction: 'NORTH', distance: 1 }],
    ['Go up', { type: 'MOVE', direction: 'NORTH', distance: 1 }],
    ['Head south', { type: 'MOVE', direction: 'SOUTH', distance: 1 }],
    ['Move to the right', { type: 'MOVE', direction: 'EAST', distance: 1 }],
    ['Move backward', { type: 'MOVE', direction: 'BACKWARD', distance: 1 }],
    ['Move east twice', { type: 'MOVE', direction: 'EAST', distance: 2 }],
    ['Keep going east', { type: 'MOVE', direction: 'EAST', distance: 30 }],
    ['Keep going east for three steps', { type: 'MOVE', direction: 'EAST', distance: 3 }],
    ['Dodge to the left', { type: 'MOVE', direction: 'WEST', distance: 1 }],
    ['Retreat', { type: 'MOVE', direction: 'BACKWARD', distance: 2 }],
    ['Follow the corridor', { type: 'MOVE', direction: 'FORWARD', distance: 30, careful: true }],
    ['Move carefully and avoid the traps', { type: 'MOVE', direction: 'FORWARD', distance: 1, careful: true }],
    ['please go north', { type: 'MOVE', direction: 'NORTH', distance: 1 }]
  ];
  it.each(cases)('"%s"', (text, expected) => {
    expect(acts(text)).toEqual([expected]);
  });

  it('caps distance at the maximum', () => {
    expect(acts('go north 500 steps')).toEqual([{ type: 'MOVE', direction: 'NORTH', distance: 30 }]);
  });
  it('marks every move careful when asked', () => {
    expect(acts('walk carefully north then east')).toEqual([
      { type: 'MOVE', direction: 'NORTH', distance: 1, careful: true },
      { type: 'MOVE', direction: 'EAST', distance: 1, careful: true }
    ]);
  });
});

describe('navigation to targets', () => {
  const cases: [string, string][] = [
    ['Go towards the treasure chest', 'chest'],
    ['Head towards the chest', 'chest'],
    ['Go to the exit', 'exit'],
    ['Find the exit', 'exit'],
    ['Move towards the treasure', 'chest'],
    ['Go to the next room', 'door'],
    ['Walk to the golden key', 'key'],
    ['Approach the skeleton', 'skeleton'],
    ['go to the kitchen', 'kitchen']
  ];
  it.each(cases)('"%s" -> MOVE_TO %s', (text, target) => {
    expect(acts(text)).toEqual([{ type: 'MOVE_TO', target }]);
  });
  it('"go there" has no resolvable destination', () => {
    expect(acts('Go there')).toEqual([{ type: 'MOVE_TO', target: 'there' }]);
  });
});

describe('combat, items, interaction', () => {
  it.each<[string, Action]>([
    ['Hit the goblin', { type: 'ATTACK', target: 'goblin' }],
    ['Attack the skeleton', { type: 'ATTACK', target: 'skeleton' }],
    ['Attack the nearest enemy', { type: 'ATTACK', target: undefined }],
    ['Use my sword', { type: 'ATTACK', target: undefined }],
    ['Defend', { type: 'DEFEND' }],
    ['Cast a fire spell', { type: 'CAST', spell: 'fire' }],
    ['Drink a health potion', { type: 'USE_ITEM', item: 'potion' }],
    ['Use my healing potion', { type: 'USE_ITEM', item: 'potion' }],
    ['Heal me', { type: 'USE_ITEM', item: 'potion' }],
    ['Equip the sword', { type: 'EQUIP_ITEM', item: 'sword' }],
    ['Drop the shield', { type: 'DROP_ITEM', item: 'shield' }],
    ['Pick up the key', { type: 'COLLECT', target: 'key' }],
    ['Grab the golden key', { type: 'COLLECT', target: 'key' }],
    ['Open the wooden door', { type: 'INTERACT', target: 'door' }],
    ['Unlock the door', { type: 'INTERACT', target: 'door' }],
    ['Open the chest', { type: 'INTERACT', target: 'chest' }],
    ['Open that', { type: 'INTERACT', target: undefined }],
    ['Pull the lever', { type: 'INTERACT', target: 'lever' }],
    ['Enter the portal', { type: 'MOVE_TO', target: 'exit' }]
  ])('"%s"', (text, expected) => {
    const a = acts(text)[0]!;
    expect(a).toMatchObject(expected as object);
  });

  it('repeats attacks', () => {
    expect(acts('attack the goblin twice')).toHaveLength(2);
  });
  it('does not mistake "pick up" for moving up', () => {
    expect(acts('pick up the potion')[0]!.type).toBe('COLLECT');
  });
  it('"get to the exit" is movement, not collecting', () => {
    expect(acts('get to the exit')).toEqual([{ type: 'MOVE_TO', target: 'exit' }]);
  });
});

describe('information and system commands', () => {
  it.each<[string, Action]>([
    ['Check my inventory', { type: 'INVENTORY' }],
    ['Open inventory', { type: 'INVENTORY' }],
    ['Show my items', { type: 'INVENTORY' }],
    ['How many potions do I have', { type: 'INVENTORY' }],
    ['How much health do I have?', { type: 'STATUS', query: 'HEALTH' }],
    ['Show my health', { type: 'STATUS', query: 'HEALTH' }],
    ['How much gold do I have?', { type: 'STATUS', query: 'GOLD' }],
    ['Check my level', { type: 'STATUS', query: 'LEVEL' }],
    ['What level am I', { type: 'STATUS', query: 'LEVEL' }],
    ['How many enemies are nearby?', { type: 'STATUS', query: 'ENEMIES' }],
    ['Is the enemy still alive?', { type: 'STATUS', query: 'ENEMIES' }],
    ['What is my objective?', { type: 'QUEST' }],
    ['What should I do next', { type: 'QUEST' }],
    ['Where is the key?', { type: 'LOCATE', target: 'key' }],
    ['Look around', { type: 'LOOK' }],
    ['Explore the room', { type: 'LOOK' }],
    ['Check the nearby area', { type: 'LOOK' }],
    ['Pause the game', { type: 'SYSTEM', command: 'PAUSE' }],
    ['Resume the game', { type: 'SYSTEM', command: 'RESUME' }],
    ['Save my progress', { type: 'SYSTEM', command: 'SAVE' }],
    ['Open settings', { type: 'SYSTEM', command: 'SETTINGS' }],
    ['Mute the sound', { type: 'SYSTEM', command: 'MUTE' }],
    ['Unmute', { type: 'SYSTEM', command: 'UNMUTE' }],
    ['Stop listening', { type: 'SYSTEM', command: 'STOP_LISTENING' }],
    ['Stop moving', { type: 'STOP' }]
  ])('"%s"', (text, expected) => {
    expect(acts(text)).toEqual([expected]);
  });
});

describe('multi-step and contextual commands', () => {
  it('splits sequences', () => {
    const c = parseLocal('Walk two steps to the right and attack the goblin');
    expect(c.intent).toBe('SEQUENCE');
    expect(c.actions).toEqual([
      { type: 'MOVE', direction: 'EAST', distance: 2 },
      { type: 'ATTACK', target: 'goblin' }
    ]);
  });
  it('carries the target across "it"', () => {
    expect(acts('Go to the treasure chest and open it')).toEqual([
      { type: 'MOVE_TO', target: 'chest' },
      { type: 'INTERACT', target: 'chest' }
    ]);
  });
  it('resolves "it" from context', () => {
    expect(acts('Attack it', { lastTarget: 'goblin' })).toEqual([{ type: 'ATTACK', target: 'goblin' }]);
    expect(acts('Attack it')).toEqual([{ type: 'ATTACK', target: undefined }]);
  });
  it('inherits the verb for bare nouns', () => {
    expect(acts('pick up the key and the potion')).toEqual([
      { type: 'COLLECT', target: 'key' }, { type: 'COLLECT', target: 'potion' }
    ]);
  });
  it('handles "then"', () => {
    expect(acts('Move east twice, then open the door')).toEqual([
      { type: 'MOVE', direction: 'EAST', distance: 2 },
      { type: 'INTERACT', target: 'door' }
    ]);
  });
  it('supports a bare second direction', () => {
    expect(acts('move north and then east')).toHaveLength(2);
  });
});

describe('unknown input', () => {
  it.each(['', '   ', 'blah blah', 'what is the weather', 'sing me a song'])('"%s"', t => {
    const c = parseLocal(t);
    expect(c.intent).toBe('UNKNOWN');
    expect(c.requiresConfirmation).toBe(true);
    expect(c.confidence).toBeLessThan(0.5);
    expect(c.actions).toEqual([]);
    expect(c.clarification).toBeTruthy();
  });
  it('refuses to partially execute a mixed command', () => {
    const c = parseLocal('move north and recite poetry');
    expect(c.requiresConfirmation).toBe(true);
    expect(c.actions).toEqual([]);
    expect(c.clarification).toMatch(/recite poetry/);
  });
  it('produces unique command ids and keeps the transcript', () => {
    const a = parseLocal('Move north'), b = parseLocal('Move north');
    expect(a.commandId).not.toBe(b.commandId);
    expect(a.transcript).toBe('Move north');
    expect(a.source).toBe('local');
  });
});

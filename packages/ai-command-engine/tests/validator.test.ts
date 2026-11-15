import { describe, expect, it } from 'vitest';
import { validateAction, validateCommand } from '../src';

describe('validateCommand', () => {
  it('accepts a well-formed command and fills defaults', () => {
    const r = validateCommand({ actions: [{ type: 'MOVE', direction: 'north', distance: 3 }], confidence: 0.96 }, 'go');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.command.actions).toEqual([{ type: 'MOVE', direction: 'NORTH', distance: 3 }]);
      expect(r.command.intent).toBe('MOVE');
      expect(r.command.transcript).toBe('go');
      expect(r.command.commandId).toMatch(/^cmd_/);
    }
  });

  it('accepts the spec style {intent, parameters}', () => {
    const r = validateCommand({ commandId: 'cmd_001', intent: 'ATTACK', parameters: { target: 'skeleton' }, confidence: 0.93, requiresConfirmation: false });
    expect(r.ok && r.command.actions).toEqual([{ type: 'ATTACK', target: 'skeleton' }]);
    if (r.ok) expect(r.command.commandId).toBe('cmd_001');
  });

  it('rejects unsupported action types (allowlist)', () => {
    const r = validateCommand({ actions: [{ type: 'TELEPORT', x: 1, y: 1 }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/not a supported action/);
  });

  it.each([
    [{ type: 'MOVE', direction: 'UP', distance: 1 }],
    [{ type: 'MOVE', direction: 'NORTH', distance: 0 }],
    [{ type: 'MOVE', direction: 'NORTH', distance: 31 }],
    [{ type: 'MOVE', direction: 'NORTH', distance: 1.5 }],
    [{ type: 'MOVE', direction: 'NORTH', distance: '3' }],
    [{ type: 'MOVE_TO' }],
    [{ type: 'USE_ITEM' }],
    [{ type: 'STATUS', query: 'SECRETS' }],
    [{ type: 'SYSTEM', command: 'FORMAT_DISK' }],
    [{ type: 'ATTACK', target: 'x'.repeat(100) }],
    ['MOVE'],
    [null]
  ])('rejects invalid action %j', bad => {
    expect(validateCommand({ actions: [bad] }).ok).toBe(false);
  });

  it('rejects non-objects, empty commands and oversize sequences', () => {
    expect(validateCommand(null).ok).toBe(false);
    expect(validateCommand('move').ok).toBe(false);
    expect(validateCommand({ actions: [] }).ok).toBe(false);
    const many = Array.from({ length: 13 }, () => ({ type: 'LOOK' }));
    expect(validateCommand({ actions: many }).ok).toBe(false);
  });

  it('allows a clarification-only command', () => {
    const r = validateCommand({ actions: [], requiresConfirmation: true, clarification: 'Where to?' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.command.intent).toBe('UNKNOWN');
      expect(r.command.clarification).toBe('Where to?');
      expect(r.command.confidence).toBeLessThanOrEqual(0.4);
    }
  });

  it('forces confirmation for low-confidence commands', () => {
    const r = validateCommand({ actions: [{ type: 'LOOK' }], confidence: 0.2, requiresConfirmation: false });
    expect(r.ok && r.command.requiresConfirmation).toBe(true);
  });

  it('drops unknown fields and normalises targets', () => {
    const a = validateAction({ type: 'ATTACK', target: ' Goblin ', hacker: 'rm -rf' }, []);
    expect(a).toEqual({ type: 'ATTACK', target: 'goblin' });
  });

  it('ignores out-of-range confidence values', () => {
    const r = validateCommand({ actions: [{ type: 'LOOK' }], confidence: 7 });
    expect(r.ok && r.command.confidence).toBe(0.8);
  });
});

import type { Action, GameCommand, Intent } from '@dungeon/shared';
import { ACTION_TYPES, ALL_DIRECTIONS, MAX_DISTANCE, STATUS_QUERIES, SYSTEM_COMMANDS } from '@dungeon/shared';
import { nextCommandId } from './localParser';

export type ValidationResult = { ok: true; command: GameCommand } | { ok: false; errors: string[] };

export const MAX_ACTIONS = 12;
const MAX_TEXT = 40;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const optStr = (v: unknown): string | undefined | null => {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string' || v.length > MAX_TEXT) return null;
  return v.toLowerCase().trim();
};

/** Validates one action from untrusted input (LLM output, network). Unknown fields are dropped. */
export function validateAction(raw: unknown, errors: string[], idx = 0): Action | null {
  const at = `actions[${idx}]`;
  if (!isObj(raw)) { errors.push(`${at} must be an object`); return null; }
  const type = raw.type;
  if (typeof type !== 'string' || !(ACTION_TYPES as readonly string[]).includes(type)) {
    errors.push(`${at}.type "${String(type)}" is not a supported action`);
    return null;
  }
  switch (type) {
    case 'MOVE': {
      const dir = typeof raw.direction === 'string' ? raw.direction.toUpperCase() : '';
      if (!(ALL_DIRECTIONS as readonly string[]).includes(dir)) { errors.push(`${at}.direction invalid`); return null; }
      const d = raw.distance === undefined ? 1 : raw.distance;
      if (typeof d !== 'number' || !Number.isInteger(d) || d < 1 || d > MAX_DISTANCE) {
        errors.push(`${at}.distance must be an integer 1..${MAX_DISTANCE}`);
        return null;
      }
      return { type, direction: dir as never, distance: d, ...(raw.careful === true ? { careful: true } : {}) };
    }
    case 'MOVE_TO':
    case 'LOCATE': {
      const t = optStr(raw.target);
      if (!t) { errors.push(`${at}.target required`); return null; }
      return { type, target: t } as Action;
    }
    case 'ATTACK':
    case 'INTERACT':
    case 'COLLECT': {
      const t = optStr(raw.target);
      if (t === null) { errors.push(`${at}.target invalid`); return null; }
      return (t ? { type, target: t } : { type }) as Action;
    }
    case 'USE_ITEM':
    case 'EQUIP_ITEM':
    case 'DROP_ITEM': {
      const t = optStr(raw.item);
      if (!t) { errors.push(`${at}.item required`); return null; }
      return { type, item: t } as Action;
    }
    case 'CAST': {
      const t = optStr(raw.spell);
      if (t === null) { errors.push(`${at}.spell invalid`); return null; }
      return t ? { type, spell: t } : { type };
    }
    case 'STATUS': {
      const q = typeof raw.query === 'string' ? raw.query.toUpperCase() : 'ALL';
      if (!(STATUS_QUERIES as readonly string[]).includes(q)) { errors.push(`${at}.query invalid`); return null; }
      return { type, query: q as never };
    }
    case 'SYSTEM': {
      const c = typeof raw.command === 'string' ? raw.command.toUpperCase() : '';
      if (!(SYSTEM_COMMANDS as readonly string[]).includes(c)) { errors.push(`${at}.command invalid`); return null; }
      return { type, command: c as never };
    }
    default:
      return { type } as Action; // DEFEND, LOOK, INVENTORY, QUEST, STOP
  }
}

/** Validates a full command. Anything the AI returns is untrusted until it passes here. */
export function validateCommand(raw: unknown, fallbackTranscript = ''): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['command must be an object'] };

  let rawActions: unknown[] = [];
  if (Array.isArray(raw.actions)) rawActions = raw.actions;
  else if (typeof raw.intent === 'string' && isObj(raw.parameters)) {
    rawActions = [{ type: raw.intent, ...raw.parameters }]; // spec-style {intent, parameters}
  }
  if (rawActions.length > MAX_ACTIONS) errors.push(`too many actions (max ${MAX_ACTIONS})`);

  const actions: Action[] = [];
  rawActions.slice(0, MAX_ACTIONS).forEach((a, i) => {
    const v = validateAction(a, errors, i);
    if (v) actions.push(v);
  });

  let confidence = typeof raw.confidence === 'number' && raw.confidence >= 0 && raw.confidence <= 1 ? raw.confidence : 0.8;
  const clarification = typeof raw.clarification === 'string' ? raw.clarification.slice(0, 200) : undefined;
  let requiresConfirmation = raw.requiresConfirmation === true;

  if (actions.length === 0 && !requiresConfirmation) errors.push('no actions and no clarification requested');
  if (errors.length > 0) return { ok: false, errors };

  if (confidence < 0.5) requiresConfirmation = true;
  if (actions.length === 0) confidence = Math.min(confidence, 0.4);
  const intent: Intent = actions.length === 0 ? 'UNKNOWN' : actions.length === 1 ? actions[0]!.type : 'SEQUENCE';
  return {
    ok: true,
    command: {
      commandId: typeof raw.commandId === 'string' && raw.commandId.length < 64 ? raw.commandId : nextCommandId(),
      transcript: typeof raw.transcript === 'string' ? raw.transcript.slice(0, 300) : fallbackTranscript,
      intent, actions, confidence, requiresConfirmation,
      ...(clarification ? { clarification } : {})
    }
  };
}

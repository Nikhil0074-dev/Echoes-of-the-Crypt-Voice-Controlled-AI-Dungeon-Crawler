import type {
  AbsDirection, Action, Direction, GameCommand, ParseContext, StatusQuery, SystemCommandName
} from '@dungeon/shared';
import { MAX_DISTANCE } from '@dungeon/shared';
import { normalizeText, stripFiller } from './normalize';

let seq = 0;
export const nextCommandId = (): string => `cmd_${Date.now().toString(36)}_${(++seq).toString(36)}`;

const PRONOUNS = ['it', 'that', 'this', 'him', 'her', 'them', 'there', 'here'];

// ---------- vocabulary ----------
const TARGET_WORDS: [string, RegExp][] = [
  ['goblin', /\bgoblins?\b/],
  ['skeleton', /\bskeletons?\b|\bguardian\b/],
  ['enemy', /\b(enem(y|ies)|monsters?|creatures?|foes?|nearest|bad guys?)\b/],
  ['chest', /\b(chests?|treasures?|loot|coffer)\b/],
  ['key', /\bkeys?\b/],
  ['potion', /\b(potions?|elixir|healing|health)\b/],
  ['shield', /\b(shields?|armou?r)\b/],
  ['sword', /\b(sword|weapon|blade)\b/],
  ['door', /\b(doors?|gate|doorway|rooms?|entrance|passage)\b/],
  ['exit', /\b(exit|stairs?|portal|way out|escape)\b/],
  ['trap', /\b(traps?|spikes?)\b/]
];

export function findTarget(phrase: string): string | undefined {
  for (const [name, re] of TARGET_WORDS) if (re.test(phrase)) return name;
  if (new RegExp(`\\b(${PRONOUNS.join('|')})\\b`).test(phrase)) return phrase.match(new RegExp(`\\b(${PRONOUNS.join('|')})\\b`))![1];
  return undefined;
}

export function findDirection(c: string): Direction | undefined {
  if (/\b(north|northward|upwards?|top)\b/.test(c) || /\bup\b(?!\s+(the|a|an|my)\b)/.test(c)) return 'NORTH';
  if (/\b(south|southward|downwards?|bottom)\b|\bdown\b/.test(c)) return 'SOUTH';
  if (/\b(east|eastward|right|rightwards?)\b/.test(c)) return 'EAST';
  if (/\b(west|westward|left|leftwards?)\b/.test(c)) return 'WEST';
  if (/\b(forwards?|ahead|straight|onwards?)\b/.test(c)) return 'FORWARD';
  if (/\b(backwards?|back|behind|reverse)\b/.test(c)) return 'BACKWARD';
  return undefined;
}

const SYSTEM_PATTERNS: [RegExp, SystemCommandName][] = [
  [/\b(stop listening|stop the (mic|microphone)|mic(rophone)? off|turn off (the )?mic(rophone)?)\b/, 'STOP_LISTENING'],
  [/\b(unpause|resume|continue the game|keep playing)\b/, 'RESUME'],
  [/\bpause\b/, 'PAUSE'],
  [/\bsave\b/, 'SAVE'],
  [/\b(unmute|sound on|turn (the )?sound on)\b/, 'UNMUTE'],
  [/\b(mute|sound off|silence)\b/, 'MUTE'],
  [/\b(settings|options)\b/, 'SETTINGS'],
  [/\b(help|what can i say|voice commands?|command list)\b/, 'HELP']
];

const VERBS = {
  attack: /\b(attack|hit|strike|fight|slash|stab|kill|smash|whack|swing|punch|slay|defeat|battle|engage)\b/,
  defend: /\b(defend|block|guard|brace|parry|protect)\b/,
  retreat: /\b(retreat|flee|fall back|run away)\b/,
  cast: /\b(cast|spell|fireball|magic)\b/,
  use: /\b(drink|quaff|consume|use|eat|apply)\b/,
  heal: /\b(heal|heal me|heal myself|restore)\b/,
  equip: /\b(equip|wield|wear|put on|unsheathe|draw)\b/,
  drop: /\b(drop|discard|throw away)\b/,
  collect: /\b(pick up|pickup|grab|collect|loot|take|get|fetch)\b/,
  interact: /\b(open|unlock|pull|activate|press|push|read|enter|flip|toggle)\b/,
  look: /\b(look|explore|examine|inspect|survey|scan|describe|what do i see|what's around|where am i|nearby area|surroundings|check the (area|room))\b/,
  move: /\b(move|go|walk|step|head|run|travel|proceed|advance|keep going|continue|march|dash|sprint|navigate|follow|approach|reach|come|climb)\b/,
  find: /\b(find|locate)\b/
};

const MOVEMENT_UNITS = /\b(steps?|tiles?|squares?|spaces?|paces?)\b/;

function parseDistance(c: string): number {
  const m = c.match(/\b(\d{1,3})\b/);
  if (m) return Math.max(1, Math.min(MAX_DISTANCE, parseInt(m[1]!, 10)));
  if (/\b(all the way|until|as far as|keep going|keep walking|continue)\b/.test(c)) return MAX_DISTANCE;
  return 1;
}

interface ClauseState { lastTarget?: string; lastType?: Action['type']; careful: boolean; ctx: ParseContext }
interface ClauseResult { actions: Action[]; clarification?: string }

function resolveTarget(raw: string | undefined, st: ClauseState): string | undefined {
  if (!raw) return undefined;
  if (PRONOUNS.includes(raw)) {
    if (raw === 'there' || raw === 'here') return 'there';
    return st.lastTarget ?? st.ctx.lastTarget;
  }
  return raw;
}

function genericTarget(t: string | undefined): string | undefined {
  return t === 'enemy' ? undefined : t;
}

/** Parses one clause. Returns null when nothing in it is understood. */
function parseClause(c: string, st: ClauseState): ClauseResult | null {
  if (!c) return null;

  // system
  for (const [re, cmd] of SYSTEM_PATTERNS) if (re.test(c)) return { actions: [{ type: 'SYSTEM', command: cmd }] };

  // inventory / status / quest / locate
  if (/\b(inventory|backpack|my items|my bag|what (do i|am i) (have|carrying)|show (me )?(my )?items|how many potions)\b/.test(c)) {
    return { actions: [{ type: 'INVENTORY' }] };
  }
  const enemyQuery = /(how many|any) (enem|monster)|(enem|monster)\w* nearby|is the (enemy|goblin|skeleton|monster) (still )?(alive|dead)/;
  if (enemyQuery.test(c)) return { actions: [{ type: 'STATUS', query: 'ENEMIES' }] };
  const askish = /\b(show|check|what|what's|whats|how|tell|display|my)\b/.test(c) && !/\b(potion|drink|use|heal me)\b/.test(c);
  if (askish) {
    const q: [RegExp, StatusQuery][] = [
      [/\b(health|hp|hit points)\b/, 'HEALTH'], [/\b(gold|coins?|money)\b/, 'GOLD'],
      [/\b(level|xp|experience)\b/, 'LEVEL'], [/\b(status|stats)\b/, 'ALL']
    ];
    for (const [re, query] of q) if (re.test(c)) return { actions: [{ type: 'STATUS', query }] };
  }
  if (/\b(objectives?|quests?|missions?|what should i do|what do i do|what now|what next|what's next|next step)\b/.test(c)) {
    return { actions: [{ type: 'QUEST' }] };
  }
  const where = c.match(/\b(?:where is|where's|wheres|where are|locate|find out where)\s+(.*)$/);
  if (where) {
    const t = findTarget(where[1]!);
    if (t) return { actions: [{ type: 'LOCATE', target: t }] };
  }
  if (/\b(look around|what do i see|what's around|where am i|nearby area|surroundings|describe)\b/.test(c) || /^(look|explore)\b/.test(c) || VERBS.look.test(c) && !VERBS.move.test(c)) {
    return { actions: [{ type: 'LOOK' }] };
  }

  const times = c.match(/\b(\d+) times\b/);
  const target = resolveTarget(findTarget(c), st);

  // retreat, defend, dodge
  if (VERBS.retreat.test(c)) return { actions: [{ type: 'MOVE', direction: 'BACKWARD', distance: 2 }] };
  if (/\bdodge\b/.test(c)) {
    const d = findDirection(c) ?? 'BACKWARD';
    return { actions: [{ type: 'MOVE', direction: d, distance: 1 }] };
  }
  if (VERBS.defend.test(c)) return { actions: [{ type: 'DEFEND' }] };

  // spells
  if (VERBS.cast.test(c)) return { actions: [{ type: 'CAST', spell: c.includes('fire') ? 'fire' : undefined }] };

  // use "my sword" = attack
  if (/\buse\b/.test(c) && (target === 'sword')) return { actions: [{ type: 'ATTACK', target: undefined }] };

  // equip / drop
  if (VERBS.equip.test(c) && target && !PRONOUNS.includes(target)) return { actions: [{ type: 'EQUIP_ITEM', item: target }] };
  if (VERBS.drop.test(c) && target && !PRONOUNS.includes(target)) return { actions: [{ type: 'DROP_ITEM', item: target }] };

  // use / heal
  if (VERBS.heal.test(c) && !target) return { actions: [{ type: 'USE_ITEM', item: 'potion' }] };
  if (VERBS.use.test(c) || VERBS.heal.test(c)) {
    if (target === 'door' || target === 'chest') return { actions: [{ type: 'INTERACT', target }] };
    if (target && !PRONOUNS.includes(target)) return { actions: [{ type: 'USE_ITEM', item: target }] };
  }

  // collect (guard against "take 3 steps", "get to the exit")
  if (VERBS.collect.test(c) && !MOVEMENT_UNITS.test(c) && !/\b(get|take|come) (to|into|out|back|closer|away|me|us)\b/.test(c)) {
    return { actions: [{ type: 'COLLECT', target: genericTarget(target) }] };
  }

  // attack
  if (VERBS.attack.test(c)) {
    const n = Math.min(5, times ? parseInt(times[1]!, 10) : 1);
    const t = target === 'there' ? undefined : genericTarget(target);
    return { actions: Array.from({ length: Math.max(1, n) }, (): Action => ({ type: 'ATTACK', target: t })) };
  }

  // "enter the portal/exit" => travel there, other "enter/open/..." => interact
  if (/\benter\b/.test(c) && target === 'exit') return { actions: [{ type: 'MOVE_TO', target: 'exit' }] };
  if (VERBS.interact.test(c)) {
    const t = target === 'there' ? undefined : target;
    const other = c.match(/\b(lever|switch|inscription|altar|button|statue)\b/);
    return { actions: [{ type: 'INTERACT', target: other ? other[1] : t }] };
  }

  // follow the corridor
  if (/\bfollow\b.*\b(corridor|path|hall|passage|tunnel)\b/.test(c)) {
    return { actions: [{ type: 'MOVE', direction: 'FORWARD', distance: MAX_DISTANCE, careful: true }] };
  }

  // movement toward a noun: "go to the chest", "find the exit"
  const prep = c.match(/\b(?:to|towards?|toward|into|near|next to|up to|over to|at)\s+(?:the |a |an |my |that |this )?(.+)$/);
  const wantsTravel = VERBS.move.test(c) || VERBS.find.test(c) || /\bget (to|into|closer to)\b/.test(c);
  if (wantsTravel) {
    const phrase = prep ? prep[1]! : c.replace(VERBS.move, '').replace(VERBS.find, '').trim();
    const t = findTarget(phrase);
    if (t) {
      const r = resolveTarget(t, st);
      return { actions: [{ type: 'MOVE_TO', target: r ?? 'there' }] };
    }
    if (!findDirection(phrase) && !MOVEMENT_UNITS.test(c) && phrase && prep && !/^\d+/.test(phrase)) {
      return { actions: [{ type: 'MOVE_TO', target: phrase.replace(/^(the|a|an)\s+/, '').trim() }] };
    }
  }
  if (VERBS.find.test(c) && !wantsTravel) return null;

  // directional movement (verb optional)
  const dir = findDirection(c);
  if (dir || (wantsTravel && /^(move|go|walk|step|head|run|advance|proceed|continue)\b/.test(c)) || MOVEMENT_UNITS.test(c)) {
    const careful = st.careful;
    return { actions: [{ type: 'MOVE', direction: dir ?? 'FORWARD', distance: parseDistance(c), ...(careful ? { careful: true } : {}) }] };
  }

  // stop / wait
  if (/\b(stop|halt|wait|stay|freeze)\b/.test(c)) return { actions: [{ type: 'STOP' }] };

  // bare noun inherits previous action ("... the key and the potion")
  if (target && st.lastType && ['ATTACK', 'COLLECT', 'INTERACT', 'MOVE_TO', 'LOCATE'].includes(st.lastType)) {
    const t = resolveTarget(target, st) ?? target;
    switch (st.lastType) {
      case 'ATTACK': return { actions: [{ type: 'ATTACK', target: genericTarget(t) }] };
      case 'COLLECT': return { actions: [{ type: 'COLLECT', target: genericTarget(t) }] };
      case 'INTERACT': return { actions: [{ type: 'INTERACT', target: t }] };
      case 'MOVE_TO': return { actions: [{ type: 'MOVE_TO', target: t }] };
      case 'LOCATE': return { actions: [{ type: 'LOCATE', target: t }] };
      default: break;
    }
  }
  return null;
}

const CLAUSE_SPLIT = /\s*(?:,|;|\band then\b|\bthen\b|\bafter that\b|\bafterwards\b|\band\b)\s*/;

/** Rule-based natural language -> structured command. Deterministic, offline, and fast. */
export function parseLocal(transcript: string, ctx: ParseContext = {}): GameCommand {
  const base = { commandId: nextCommandId(), transcript, source: 'local' as const };
  let text = stripFiller(normalizeText(transcript));
  if (!text) {
    return { ...base, intent: 'UNKNOWN', actions: [], confidence: 0, requiresConfirmation: true, clarification: "I didn't hear a command." };
  }

  const carefulRe = /\b(carefully|careful|cautiously|safely|avoid(ing)? (the )?(traps?|spikes?))\b/g;
  const careful = carefulRe.test(text);
  text = text.replace(carefulRe, ' ').replace(/\s+/g, ' ').trim();

  const st: ClauseState = { careful, ctx };
  const actions: Action[] = [];
  const unknown: string[] = [];
  let clarification: string | undefined;

  for (const clause of text.split(CLAUSE_SPLIT).map(s => s.trim()).filter(Boolean)) {
    const r = parseClause(clause, st);
    if (!r) { unknown.push(clause); continue; }
    if (r.clarification) clarification = r.clarification;
    for (const a of r.actions) {
      actions.push(a);
      st.lastType = a.type;
      const tgt = (a as { target?: string }).target;
      if (tgt && tgt !== 'there') st.lastTarget = tgt;
    }
  }

  if (actions.length === 0 || unknown.length > 0) {
    const said = unknown.length ? unknown.join(', ') : text;
    return {
      ...base, intent: 'UNKNOWN', actions: [], confidence: actions.length ? 0.4 : 0.2, requiresConfirmation: true,
      clarification: clarification ?? `I didn't understand "${said}". Try "move north", "attack the goblin" or say "help".`
    };
  }
  if (actions.length > 12) actions.length = 12;
  return {
    ...base,
    intent: actions.length === 1 ? actions[0]!.type : 'SEQUENCE',
    actions, confidence: 0.92, requiresConfirmation: false, ...(clarification ? { clarification } : {})
  };
}

export type { AbsDirection };

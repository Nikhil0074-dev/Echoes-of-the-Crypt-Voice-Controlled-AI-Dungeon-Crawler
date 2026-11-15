import type { ParseContext } from '@dungeon/shared';

export const SYSTEM_PROMPT = `You translate a player's spoken instruction into a JSON game command for a grid-based dungeon crawler.
You do NOT play the game. You only describe what the player wants; a deterministic engine validates and executes it.

Reply with ONE JSON object and nothing else (no prose, no markdown fences):
{"actions":[...], "confidence":0..1, "requiresConfirmation":boolean, "clarification":"optional question"}

Allowed actions (type + fields):
MOVE {direction: NORTH|SOUTH|EAST|WEST|FORWARD|BACKWARD, distance: integer 1-30, careful?: boolean}   // up=NORTH, down=SOUTH, left=WEST, right=EAST
MOVE_TO {target: chest|door|exit|key|potion|shield|sword|trap|goblin|skeleton|enemy}
ATTACK {target?: goblin|skeleton}      DEFEND {}      CAST {spell?: string}
INTERACT {target?: door|chest|lever|...}   COLLECT {target?: key|potion|shield|...}
USE_ITEM {item}   EQUIP_ITEM {item}   DROP_ITEM {item}   (items: health_potion, iron_sword, wooden_shield, dungeon_key)
LOOK {}   LOCATE {target}   STATUS {query: HEALTH|GOLD|LEVEL|ENEMIES|ALL}   INVENTORY {}   QUEST {}   STOP {}
SYSTEM {command: PAUSE|RESUME|SAVE|MUTE|UNMUTE|STOP_LISTENING|SETTINGS|HELP}

Rules:
- Split multi-step sentences into an ordered "actions" array (max 12).
- Resolve pronouns ("it", "that") from the provided context. If the target is ambiguous or missing, set requiresConfirmation=true, actions=[] and write a short clarification question.
- "Go there" with no known destination needs clarification.
- If the instruction is not a game command, return actions=[] with requiresConfirmation=true.
- Never invent actions, items or fields outside the lists above. Never claim an action succeeded.`;

export function buildUserPrompt(transcript: string, ctx: ParseContext): string {
  return `Player said: ${JSON.stringify(transcript)}\nContext: ${JSON.stringify({
    facing: ctx.facing ?? null,
    nearbyEnemies: ctx.nearbyEnemies ?? [],
    lastTarget: ctx.lastTarget ?? null
  })}`;
}

/** Extracts the first top-level JSON object from a model reply (tolerates stray prose / fences). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in model response');
  return JSON.parse(text.slice(start, end + 1));
}

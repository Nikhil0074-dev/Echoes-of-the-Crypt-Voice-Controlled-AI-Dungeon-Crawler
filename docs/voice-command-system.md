# Voice command system

## Pipeline

`SpeechRecognitionManager` (browser) → `TranscriptProcessor.accept()` → `interpret()` (local or server) → `GameCommand` → `executeCommand`.

Voice states shown in the console: **Mic off · Listening · Interpreting · Understood · Executing · Done · Couldn't do that**.

## Command JSON

```json
{
  "commandId": "cmd_mw553dab_1",
  "transcript": "Walk two steps to the right and attack the goblin",
  "intent": "SEQUENCE",
  "actions": [
    { "type": "MOVE", "direction": "EAST", "distance": 2 },
    { "type": "ATTACK", "target": "goblin" }
  ],
  "confidence": 0.92,
  "requiresConfirmation": false,
  "source": "local"
}
```

The validator also accepts the simpler `{ "intent": "ATTACK", "parameters": { "target": "skeleton" } }` form.

## Actions

| Type | Fields | Notes |
|---|---|---|
| MOVE | direction (N/S/E/W/FORWARD/BACKWARD), distance 1–30, careful? | up=N, down=S, left=W, right=E; careful stops before traps |
| MOVE_TO | target | pathfinds (BFS, avoids traps) to chest/door/exit/key/potion/enemy… in explored areas |
| ATTACK / DEFEND / CAST | target? | CAST replies that no spells are known yet |
| INTERACT | target? | doors (open/unlock), chests |
| COLLECT / USE_ITEM / EQUIP_ITEM / DROP_ITEM | target / item | items: health potion, iron sword, wooden shield, dungeon key |
| LOOK / LOCATE / STATUS / INVENTORY / QUEST / STOP | — | free actions (no enemy turn) |
| SYSTEM | PAUSE, RESUME, SAVE, MUTE, UNMUTE, STOP_LISTENING, SETTINGS, HELP | handled by the controller |

## Phrasing the local parser understands (examples)

Movement: "move north", "go three steps left", "take one step ahead", "walk towards the top", "move east twice", "keep going east", "follow the corridor", "move carefully and avoid the traps".
Travel: "go to the treasure chest", "head towards the exit", "find the key", "go to the next room".
Combat: "hit the goblin", "attack the nearest enemy", "use my sword", "defend", "dodge to the left", "retreat".
Items/interaction: "drink a health potion", "pick up the golden key", "open the wooden door", "unlock the door", "equip the shield", "drop the shield".
Questions: "how much health do I have?", "what is my objective?", "where is the key?", "how many enemies are nearby?".
Combos: "go to the chest and open it", "move east twice, then open the door", "pick up the key and the potion".
Filler such as "please", "can you", "hey dungeon" is ignored.

## Browser support and fallbacks

Chrome, Edge and Safari expose `SpeechRecognition`/`webkitSpeechRecognition`; Firefox does not. The mic needs HTTPS or `localhost`.
When unavailable the orb is disabled with an explanation; the text box, suggestion chips and keyboard keys work identically.
Recognition errors map to friendly messages (permission denied, no microphone, network, no speech).

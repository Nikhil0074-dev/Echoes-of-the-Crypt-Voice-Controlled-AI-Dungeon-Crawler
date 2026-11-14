# System architecture

## Layers

1. **UI (React)** — main menu, HUD, voice console, side panel, modals. Reads one immutable snapshot from the controller via `useSyncExternalStore`.
2. **Speech layer** — `SpeechRecognitionManager` wraps the browser API (interim + final results, error mapping, hands-free auto-restart, unsupported-browser detection). `TranscriptProcessor` cleans text and drops duplicate finals. `VoiceFeedback` is optional TTS and pauses the mic while speaking. `Sfx` synthesises sounds with WebAudio.
3. **Command interpretation (`ai-command-engine`)** — `normalizeText` → `parseLocal` (rule-based, offline) and/or an LLM through `CommandPipeline`, always followed by `validateCommand`.
4. **Game logic (`game-core`)** — pure functions: `executeCommand(state, command) → { state, events, messages, … }`. Never mutates its input.
5. **Rendering (Phaser)** — `DungeonScene` replays engine **events** as tweens (steps, lunges, floating damage numbers, fog), then snaps to the authoritative state.
6. **Persistence / communication** — `localStorage` saves and settings (versioned, validated on load); Express + Socket.IO server for AI interpretation.

## Data flow of one command

```
"Walk two steps to the right and attack the goblin"
  → normalize: "walk 2 steps to the right and attack the goblin"
  → split clauses → [MOVE EAST 2, ATTACK goblin]          (confidence 0.92)
  → validateCommand (allowlist, bounds)                    untrusted input stops here
  → GameController.applyCommand
      → executeCommand: step 1 moves (enemy phase after each tile),
        step 2 attacks only if step 1 fully succeeded
  → result { state, events[], messages[] }
  → UI log/history + Phaser plays events + optional speech
```

## Guarantees

- Unknown or low-confidence commands (`requiresConfirmation`) are **never executed**; the player gets a clarification.
- Ambiguity is resolved by the engine, not guessed: "attack" with two enemy kinds adjacent asks *which*; "open it" with a door and chest adjacent asks *which*; "go there" asks *where*.
- Movement is validated one tile at a time (walls, doors, chests, enemies, traps) and is interrupted by damage or an adjacent enemy.
- Paused game: only SYSTEM/LOOK/STATUS/INVENTORY/QUEST/LOCATE actions are accepted.
- Commands are processed strictly one at a time with a bounded queue (3). Duplicate voice finals within 1.2 s are dropped.
- Fog of war: `LOCATE`/`MOVE_TO` only know tiles the torch has revealed.

## Roadmap (not implemented)

Procedural dungeon generation (seeded rooms-and-corridors with reachability checks — `parseLevel` already produces the state it would target), spells and mana, NPC dialogue, accounts and PostgreSQL saves, multiplayer, AI narrator.

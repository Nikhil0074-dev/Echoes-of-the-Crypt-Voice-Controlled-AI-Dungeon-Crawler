# Echoes of the Crypt - Voice-Controlled AI Dungeon Crawler
 
Speak to your hero. *"Go to the treasure chest and open it."* A natural-language layer turns speech into a structured command, a deterministic game engine validates and runs it, and a Phaser pixel-art dungeon shows what happened.

```
Microphone → Web Speech API → transcript → Command interpreter → structured JSON  → schema validation → game-state validation (engine) → animated result
```


![Architecture diagram](docs/diagram.png) **Architecture diagram**


The **AI never touches game state.** It only proposes actions. The engine decides what is legal.

## Quick start

Requires Node 20+ (tested on Node 22).

```bash
npm install
npm run dev          # client on http://localhost:5173 + server on :3001
```

Open the client in **Chrome, Edge or Safari** (the Web Speech API needs one of these and `localhost`/HTTPS).
Click the orb (or press `M`), allow the microphone, and say *"look around"*. Typing and keyboard controls work everywhere.

| Script | What it does |
|---|---|
| `npm run dev` | Server + client with hot reload |
| `npm run dev:client` / `dev:server` | Run one side only (the client works fully offline without the server) |
| `npm test` | All unit, component, integration and server tests |
| `npm run typecheck` | `tsc --noEmit` in every workspace |
| `npm run build` | Production client bundle in `apps/game-client/dist` |
| `npm run verify` | typecheck + tests + build |
| `npm run start:server` | Run the API/WebSocket server |

### Optional: LLM interpretation

Copy `.env.example` to `.env`, set `ANTHROPIC_API_KEY`, and restart the server. In the game's **Settings**
choose *Server AI*. Modes (`AI_MODE`): `hybrid` (default: local parser first, LLM only for phrasing it cannot read),
`llm`, or `local`. Every model reply is parsed, schema-validated against an allowlist, and falls back to the local
parser on any error, timeout or invalid output. API keys never reach the browser.

## Controls

**Voice** — see *Settings → Voice Command Guide* in the game, or `docs/voice-command-system.md`.

**Keyboard fallback** — `WASD`/arrows move · `Space` attack · `E` interact · `F` pick up · `Q` potion · `M` mic · `P`/`Esc` pause.

## The game

The *Crypt of Echoes*: find the key, unlock the east door, open the chest, defeat the Skeleton Guardian, reach the portal.
Your torch lights a limited radius; unexplored tiles stay dark, and "where is the key?" only answers for places you have seen.
Damage = attack − defense (min 1); enemies chase and strike back after most actions; multi-step movement is interrupted
when something attacks or blocks you; a sequence stops at the first step that fails.

## Project layout

```
apps/
  game-client/   React + Phaser + Vite UI, voice layer, controller, persistence
  server/        Express REST + Socket.IO, rate limiting, optional LLM
packages/
  shared/            Types shared by everyone (commands, state, events)
  game-core/         Pure game rules: level parsing, pathfinding, combat, items, quests (no Phaser, no DOM)
  ai-command-engine/ Normaliser, rule parser, validator, LLM adapter, pipeline
docs/                Architecture, voice command system, API, deployment

```

Key design rules (all enforced by tests): AI output is untrusted; the engine is the single source of truth;
`game-core` is pure and independently testable; every action is validated per step; unclear commands never execute.

## Tests

`npm test` runs ~290 tests across: the rule parser (phrasing table), the validator (allowlist/bounds), the LLM
pipeline (mock provider, timeouts, invalid output), movement/combat/inventory/interaction rules, a scripted full
playthrough, the REST API and Socket.IO server, the speech manager (fake recogniser), the voice → engine → UI
flow, React components, persistence, and a **headless real-Phaser boot** of the dungeon scene.


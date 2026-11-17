# API (server, optional)

Base path `/api/v1`. JSON bodies ≤ 64 KB. `/commands/interpret` is limited to 120 requests/min per IP (429 + `Retry-After`).

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/health` | — | `{ ok: true, ai: "local" \| "anthropic" }` |
| POST | `/commands/interpret` | `{ transcript: string (1–300), context?: { facing?, nearbyEnemies?, lastTarget? } }` | `{ command, usedLlm }` · 400 `invalid_transcript` |
| POST | `/commands/validate` | `{ command, state? }` | `{ valid: true, command, preview? }` · 422 `{ valid: false, errors }` |

`validate` with a `state` dry-runs the command against that state and returns `preview: { ok, messages, clarification }` without changing anything.

## Socket.IO

| Client → server | Payload |
|---|---|
| `voice:transcript` | `{ requestId?, transcript, context? }` |

| Server → client | Payload |
|---|---|
| `command:interpreted` | `{ requestId, command, usedLlm }` |
| `command:rejected` | `{ requestId, reason: "invalid_transcript" \| "duplicate" \| "internal_error" }` |

Duplicate `requestId`s within a connection are rejected.

## Persistence 

Client saves use `localStorage` key `vdc.save.v1` (`{ version, savedAt, state }`); loads are validated structurally and rejected if corrupt or from another version. Settings use `vdc.settings.v1`.

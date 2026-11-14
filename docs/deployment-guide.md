# Deployment

**Client** — `npm run build`, serve `apps/game-client/dist` from any static host over **HTTPS** (required for the microphone).
Point `/api` and `/socket.io` at the server (same-origin reverse proxy, as the Vite dev proxy does).

**Server** — `npm run start:server` (tsx runs the TypeScript directly). Environment: `PORT`, `CLIENT_ORIGIN` (CORS and Socket.IO origin),
`ANTHROPIC_API_KEY` (optional), `AI_MODEL`, `AI_MODE` (`hybrid`|`llm`|`local`). Behind a proxy `trust proxy` is already enabled for per-IP rate limits.
The rate limiter is in-memory: use a shared store (e.g. Redis) before running several instances.

**Without a server** the game still works completely (Settings → Local rules). Deploy only the static client.

**Not included:** Docker/compose files and CI configuration.

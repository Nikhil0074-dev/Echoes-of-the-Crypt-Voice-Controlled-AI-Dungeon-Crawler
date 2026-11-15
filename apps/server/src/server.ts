import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { CommandPipeline, createProviderFromEnv, type PipelineMode } from '@dungeon/ai-engine';
import { createApp } from './app';
import { attachSockets } from './sockets';

const port = Number(process.env.PORT ?? 3001);
const origin = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const mode = (['local', 'hybrid', 'llm'].includes(process.env.AI_MODE ?? '') ? process.env.AI_MODE : 'hybrid') as PipelineMode;

const pipeline = new CommandPipeline({ provider: createProviderFromEnv(process.env), mode });
const app = createApp({ pipeline, clientOrigin: origin });
const http = createServer(app);
const io = new Server(http, { cors: { origin } });
attachSockets(io, pipeline);

http.listen(port, () => {
  console.log(`Dungeon server on http://localhost:${port} (command AI: ${pipeline.providerName}, mode: ${mode})`);
});

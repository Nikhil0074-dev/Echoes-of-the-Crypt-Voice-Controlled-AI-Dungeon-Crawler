import type { Server, Socket } from 'socket.io';
import type { CommandPipeline } from '@dungeon/ai-engine';
import { MAX_TRANSCRIPT, parseContext } from './app';

export interface TranscriptPayload { requestId?: string; transcript?: unknown; context?: unknown }

export function attachSockets(io: Server, pipeline: CommandPipeline): void {
  io.on('connection', (socket: Socket) => {
    const seen = new Set<string>();
    socket.on('voice:transcript', async (payload: TranscriptPayload = {}) => {
      const requestId = typeof payload.requestId === 'string' ? payload.requestId.slice(0, 64) : undefined;
      if (typeof payload.transcript !== 'string' || !payload.transcript.trim() || payload.transcript.length > MAX_TRANSCRIPT) {
        socket.emit('command:rejected', { requestId, reason: 'invalid_transcript' });
        return;
      }
      if (requestId) {
        if (seen.has(requestId)) { socket.emit('command:rejected', { requestId, reason: 'duplicate' }); return; }
        seen.add(requestId);
        if (seen.size > 200) seen.delete(seen.values().next().value as string);
      }
      try {
        const r = await pipeline.interpret(payload.transcript, parseContext(payload.context));
        socket.emit('command:interpreted', { requestId, command: r.command, usedLlm: r.usedLlm });
      } catch {
        socket.emit('command:rejected', { requestId, reason: 'internal_error' });
      }
    });
  });
}

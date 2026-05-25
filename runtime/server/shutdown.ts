import type { FastifyInstance } from 'fastify';
import { readSession } from '../store/session-store.ts';

export interface ShutdownOpts {
  deckDir: string;
  sessionId: string;
  postCloseMs?: number;
  hardCapMs?: number;
  tickIntervalMs?: number;
}

export function registerAutoShutdown(app: FastifyInstance, opts: ShutdownOpts): () => void {
  const postCloseMs = opts.postCloseMs ?? 5 * 60 * 1000;
  const hardCapMs = opts.hardCapMs ?? 24 * 60 * 60 * 1000;
  const tickIntervalMs = opts.tickIntervalMs ?? 30_000;
  const startedAt = Date.now();
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const session = await readSession({ deckDir: opts.deckDir, sessionId: opts.sessionId });
      const elapsed = Date.now() - startedAt;
      if (elapsed >= hardCapMs) {
        await app.close();
        return;
      }
      if (session.closed && session.closed_at) {
        const sinceClose = Date.now() - new Date(session.closed_at).getTime();
        if (sinceClose >= postCloseMs) {
          await app.close();
          return;
        }
      }
    } catch {
      // session file may not exist yet; ignore
    }
    if (!stopped) timer = setTimeout(tick, tickIntervalMs);
  };

  timer = setTimeout(tick, tickIntervalMs);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

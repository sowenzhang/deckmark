import Fastify, { type FastifyInstance } from 'fastify';
import { registerStaticAndOverlay } from './static-overlay.ts';
import { registerApi } from './api.ts';
import { registerAutoShutdown } from './shutdown.ts';

export interface ServerOpts {
  deckDir: string;
  sessionId: string;
  autoShutdown?: boolean;
  postCloseMs?: number;
  hardCapMs?: number;
  tickIntervalMs?: number;
}

export async function createServer(opts: ServerOpts): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerApi(app, opts);
  await registerStaticAndOverlay(app, opts);
  if (opts.autoShutdown !== false) {
    const cancel = registerAutoShutdown(app, {
      deckDir: opts.deckDir,
      sessionId: opts.sessionId,
      postCloseMs: opts.postCloseMs,
      hardCapMs: opts.hardCapMs,
      tickIntervalMs: opts.tickIntervalMs
    });
    app.addHook('onClose', async () => cancel());
  }
  return app;
}

// mcp/tools/review.ts
import { resolve } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../../runtime/server/factory.ts';
import { createSession, readSession } from '../../runtime/store/session-store.ts';
import { buildHash } from '../../runtime/store/build-hash.ts';

interface RunningServer {
  app: FastifyInstance;
  deckDir: string;
  sessionId: string;
  port: number;
  startedAt: number;
}

const running = new Map<string, RunningServer>();

interface StartInput {
  dir?: string;
  port?: number;
}

export const startReviewTool = {
  name: 'start_review',
  description:
    'Launch the local review server and return its URL. Non-blocking. Pair with wait_for_close, or call get_annotations directly when the user signals they are done.',
  inputSchema: {
    type: 'object',
    properties: {
      dir: { type: 'string', description: 'Project directory (defaults to cwd)' },
      port: { type: 'number', description: 'Port (0 = ephemeral, default 0)' }
    }
  },
  handler: async (input: Record<string, unknown>) => {
    const opts = input as unknown as StartInput;
    const deckDir = opts.dir ? resolve(process.cwd(), opts.dir) : process.cwd();
    const existing = [...running.values()].filter(r => r.deckDir === deckDir);
    for (const r of existing) {
      try { await r.app.close(); } catch { /* ignore */ }
    }
    const hash = await buildHash(resolve(deckDir, 'build'));
    const session = await createSession({ deckDir, engine: 'reveal', buildHash: hash });
    const app = await createServer({ deckDir, sessionId: session.session_id });
    app.addHook('onClose', async () => { running.delete(session.session_id); });
    await app.listen({ port: opts.port ?? 0, host: '127.0.0.1' });
    const port = (app.server.address() as { port: number }).port;
    running.set(session.session_id, {
      app, deckDir, sessionId: session.session_id, port, startedAt: Date.now()
    });
    return {
      url: `http://127.0.0.1:${port}`,
      session_id: session.session_id,
      port
    };
  }
};

interface WaitInput {
  session_id: string;
  timeout_seconds?: number;
}

export const waitForCloseTool = {
  name: 'wait_for_close',
  description:
    'Block until the user clicks Done in the browser, or until timeout_seconds elapses. If the user never clicked Done, returns timed_out:true and the agent can still call get_annotations.',
  inputSchema: {
    type: 'object',
    properties: {
      session_id: { type: 'string' },
      timeout_seconds: { type: 'number', default: 1800 }
    },
    required: ['session_id']
  },
  handler: async (input: Record<string, unknown>) => {
    const opts = input as unknown as WaitInput;
    const timeoutMs = (opts.timeout_seconds ?? 1800) * 1000;
    const r = running.get(opts.session_id);
    if (!r) {
      return { closed: false, timed_out: false, error: 'unknown session_id' };
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        const s = await readSession({ deckDir: r.deckDir, sessionId: opts.session_id });
        if (s.closed) {
          return {
            closed: true,
            timed_out: false,
            annotation_count: s.annotations.length
          };
        }
      } catch { /* file not yet ready */ }
      await new Promise(res => setTimeout(res, 1000));
    }
    return { closed: false, timed_out: true };
  }
};

interface StopInput {
  session_id: string;
}

export const stopReviewTool = {
  name: 'stop_review',
  description:
    'Stop the review server for a session. Optional — the server auto-stops 5 min after Done, or 24 h after start.',
  inputSchema: {
    type: 'object',
    properties: { session_id: { type: 'string' } },
    required: ['session_id']
  },
  handler: async (input: Record<string, unknown>) => {
    const opts = input as unknown as StopInput;
    const r = running.get(opts.session_id);
    if (!r) return { stopped: false, reason: 'unknown or already stopped' };
    try { await r.app.close(); } catch { /* ignore */ }
    return { stopped: true };
  }
};

import type { FastifyInstance } from 'fastify';
import { appendAnnotation, closeSession, readSession } from '../store/session-store.ts';
import type { AnnotationInput } from '../types/session.ts';

interface ApiOpts {
  deckDir: string;
  sessionId: string;
}

export function registerApi(app: FastifyInstance, opts: ApiOpts): void {
  app.post('/api/annotations', async (req, reply) => {
    const payload = req.body as Partial<AnnotationInput> | undefined;
    if (!payload || !payload.slide || !payload.element || typeof payload.comment !== 'string') {
      reply.code(400);
      return { error: 'invalid annotation payload' };
    }
    const a = await appendAnnotation({
      deckDir: opts.deckDir,
      sessionId: opts.sessionId,
      annotation: payload as AnnotationInput
    });
    return a;
  });

  app.post('/api/close', async (req) => {
    const body = (req.body ?? {}) as { summary?: string };
    const session = await closeSession({
      deckDir: opts.deckDir,
      sessionId: opts.sessionId,
      summary: typeof body.summary === 'string' ? body.summary : null
    });
    return { closed: true, closed_at: session.closed_at, summary: session.summary };
  });

  app.get('/api/state', async () => {
    const session = await readSession({ deckDir: opts.deckDir, sessionId: opts.sessionId });
    return session;
  });
}

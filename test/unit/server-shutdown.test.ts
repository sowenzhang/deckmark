import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import { createServer } from '../../runtime/server/factory.ts';
import { createSession, closeSession } from '../../runtime/store/session-store.ts';

test('auto-shutdown closes the server postCloseMs after session is closed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'deckmark-shutdown-'));
  await mkdir(join(dir, 'build'), { recursive: true });
  await writeFile(join(dir, 'build', 'index.html'), '<html></html>');
  const s = await createSession({ deckDir: dir, engine: 'reveal', buildHash: 'h' });
  const app = await createServer({
    deckDir: dir,
    sessionId: s.session_id,
    autoShutdown: true,
    tickIntervalMs: 50,
    postCloseMs: 50
  });
  let closed = false;
  app.addHook('onClose', async () => { closed = true; });
  await app.listen({ port: 0 });

  // close session via store; the shutdown tick should pick this up
  await closeSession({ deckDir: dir, sessionId: s.session_id, summary: null });

  // wait up to ~1s for the shutdown to fire
  for (let i = 0; i < 20; i++) {
    if (closed) break;
    await wait(50);
  }
  assert.equal(closed, true, 'expected auto-shutdown to close the app within 1s');
  await rm(dir, { recursive: true, force: true });
});

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSession, readSession, appendAnnotation, closeSession } from '../../runtime/store/session-store.ts';

async function tmpDir() {
  return await mkdtemp(join(tmpdir(), 'deckmark-test-'));
}

test('createSession writes initial session file', async () => {
  const dir = await tmpDir();
  const s = await createSession({
    deckDir: dir,
    engine: 'reveal',
    buildHash: 'sha256:abc'
  });
  assert.equal(s.closed, false);
  assert.equal(s.annotations.length, 0);
  assert.equal(s.engine, 'reveal');
  const onDisk = JSON.parse(
    await readFile(join(dir, 'annotations', `session-${s.session_id}.json`), 'utf8')
  );
  assert.equal(onDisk.session_id, s.session_id);
  await rm(dir, { recursive: true, force: true });
});

test('readSession returns latest by default', async () => {
  const dir = await tmpDir();
  const s = await createSession({ deckDir: dir, engine: 'reveal', buildHash: 'h1' });
  const back = await readSession({ deckDir: dir });
  assert.equal(back.session_id, s.session_id);
  await rm(dir, { recursive: true, force: true });
});

test('appendAnnotation adds to file and updates latest', async () => {
  const dir = await tmpDir();
  const s = await createSession({ deckDir: dir, engine: 'reveal', buildHash: 'h1' });
  await appendAnnotation({
    deckDir: dir,
    sessionId: s.session_id,
    annotation: {
      slide: { index: 0, id: null, title: 'T' },
      element: {
        selector: 'h1', dom_path: 'h1', tag: 'h1', text: 'X',
        bbox: { x: 0, y: 0, w: 10, h: 10 }
      },
      comment: 'change me'
    }
  });
  const back = await readSession({ deckDir: dir });
  assert.equal(back.annotations.length, 1);
  assert.equal(back.annotations[0].comment, 'change me');
  assert.equal(back.annotations[0].status, 'open');
  await rm(dir, { recursive: true, force: true });
});

test('closeSession flips closed flag with summary', async () => {
  const dir = await tmpDir();
  const s = await createSession({ deckDir: dir, engine: 'reveal', buildHash: 'h1' });
  await closeSession({ deckDir: dir, sessionId: s.session_id, summary: 'less corporate' });
  const back = await readSession({ deckDir: dir });
  assert.equal(back.closed, true);
  assert.equal(back.summary, 'less corporate');
  assert.ok(back.closed_at);
  await rm(dir, { recursive: true, force: true });
});

test('concurrent appends serialize correctly', async () => {
  const dir = await tmpDir();
  const s = await createSession({ deckDir: dir, engine: 'reveal', buildHash: 'h1' });
  const writes = Array.from({ length: 10 }, (_, i) =>
    appendAnnotation({
      deckDir: dir,
      sessionId: s.session_id,
      annotation: {
        slide: { index: i, id: null, title: `s${i}` },
        element: {
          selector: `h${i}`, dom_path: `h${i}`, tag: 'h1', text: '',
          bbox: { x: 0, y: 0, w: 10, h: 10 }
        },
        comment: `c${i}`
      }
    })
  );
  await Promise.all(writes);
  const back = await readSession({ deckDir: dir });
  assert.equal(back.annotations.length, 10);
  await rm(dir, { recursive: true, force: true });
});

test('appendAnnotation produces unique annotation IDs', async () => {
  const dir = await tmpDir();
  const s = await createSession({ deckDir: dir, engine: 'reveal', buildHash: 'h1' });
  const ids = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const a = await appendAnnotation({
      deckDir: dir,
      sessionId: s.session_id,
      annotation: {
        slide: { index: 0, id: null, title: null },
        element: { selector: 'h1', dom_path: 'h1', tag: 'h1', text: '', bbox: { x: 0, y: 0, w: 1, h: 1 } },
        comment: `c${i}`
      }
    });
    ids.add(a.id);
  }
  assert.equal(ids.size, 20);
  await rm(dir, { recursive: true, force: true });
});

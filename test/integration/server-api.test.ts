import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../../runtime/server/factory.ts';
import { createSession, readSession } from '../../runtime/store/session-store.ts';

async function setup() {
  const dir = await mkdtemp(join(tmpdir(), 'deckmark-api-'));
  await mkdir(join(dir, 'build'), { recursive: true });
  await writeFile(join(dir, 'build', 'index.html'), '<html><body></body></html>');
  const s = await createSession({ deckDir: dir, engine: 'reveal', buildHash: 'h' });
  const app = await createServer({ deckDir: dir, sessionId: s.session_id, autoShutdown: false });
  await app.listen({ port: 0 });
  const port = (app.server.address() as { port: number }).port;
  return { app, port, dir, sessionId: s.session_id };
}

const ANNOTATION = {
  slide: { index: 0, id: 'title', title: 'Title' },
  element: {
    selector: 'h1', dom_path: 'h1', tag: 'h1', text: 'Hello',
    bbox: { x: 0, y: 0, w: 100, h: 50 }
  },
  comment: 'make it bigger'
};

test('POST /api/annotations appends to session file', async (t) => {
  const ctx = await setup();
  t.after(async () => { await ctx.app.close(); await rm(ctx.dir, { recursive: true, force: true }); });
  const res = await fetch(`http://127.0.0.1:${ctx.port}/api/annotations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ANNOTATION)
  });
  assert.equal(res.status, 200);
  const body = await res.json() as { id: string };
  assert.match(body.id, /^anno-/);
  const session = await readSession({ deckDir: ctx.dir, sessionId: ctx.sessionId });
  assert.equal(session.annotations.length, 1);
  assert.equal(session.annotations[0].comment, 'make it bigger');
});

test('POST /api/close sets closed:true with summary', async (t) => {
  const ctx = await setup();
  t.after(async () => { await ctx.app.close(); await rm(ctx.dir, { recursive: true, force: true }); });
  const res = await fetch(`http://127.0.0.1:${ctx.port}/api/close`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ summary: 'love it' })
  });
  assert.equal(res.status, 200);
  const session = await readSession({ deckDir: ctx.dir, sessionId: ctx.sessionId });
  assert.equal(session.closed, true);
  assert.equal(session.summary, 'love it');
});

test('GET /api/state returns current session JSON', async (t) => {
  const ctx = await setup();
  t.after(async () => { await ctx.app.close(); await rm(ctx.dir, { recursive: true, force: true }); });
  await fetch(`http://127.0.0.1:${ctx.port}/api/annotations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ANNOTATION)
  });
  const res = await fetch(`http://127.0.0.1:${ctx.port}/api/state`);
  assert.equal(res.status, 200);
  const state = await res.json() as { session_id: string; annotations: unknown[]; closed: boolean };
  assert.equal(state.session_id, ctx.sessionId);
  assert.equal(state.annotations.length, 1);
  assert.equal(state.closed, false);
});

test('POST /api/annotations rejects invalid payload with 400', async (t) => {
  const ctx = await setup();
  t.after(async () => { await ctx.app.close(); await rm(ctx.dir, { recursive: true, force: true }); });
  const res = await fetch(`http://127.0.0.1:${ctx.port}/api/annotations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ comment: 'missing slide and element' })
  });
  assert.equal(res.status, 400);
});

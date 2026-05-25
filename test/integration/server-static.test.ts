import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from '../../runtime/server/factory.ts';

async function setupDeck() {
  const dir = await mkdtemp(join(tmpdir(), 'deckmark-srv-'));
  await mkdir(join(dir, 'build'), { recursive: true });
  await writeFile(
    join(dir, 'build', 'index.html'),
    '<!doctype html><html><body><h1>Hi</h1></body></html>'
  );
  return dir;
}

test('GET / serves index.html with overlay script injected before </body>', async (t) => {
  const deck = await setupDeck();
  const app = await createServer({ deckDir: deck, sessionId: 'test-session', autoShutdown: false });
  await app.listen({ port: 0 });
  const port = (app.server.address() as { port: number }).port;
  t.after(async () => { await app.close(); await rm(deck, { recursive: true, force: true }); });
  const res = await fetch(`http://127.0.0.1:${port}/`);
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(body, /<script[^>]+overlay\.js/);
  assert.match(body, /<script[^>]+overlay\.js[^>]*><\/script>\s*<\/body>/i);
  assert.match(body, /<h1>Hi<\/h1>/);
});

test('GET /overlay/overlay.js returns the bundled overlay', async (t) => {
  const deck = await setupDeck();
  const app = await createServer({ deckDir: deck, sessionId: 'test-session', autoShutdown: false });
  await app.listen({ port: 0 });
  const port = (app.server.address() as { port: number }).port;
  t.after(async () => { await app.close(); await rm(deck, { recursive: true, force: true }); });
  const res = await fetch(`http://127.0.0.1:${port}/overlay/overlay.js`);
  assert.equal(res.status, 200);
  const ct = res.headers.get('content-type') ?? '';
  assert.match(ct, /javascript/);
});

test('path traversal attempts return 403', async (t) => {
  const deck = await setupDeck();
  const app = await createServer({ deckDir: deck, sessionId: 'test-session', autoShutdown: false });
  await app.listen({ port: 0 });
  const port = (app.server.address() as { port: number }).port;
  t.after(async () => { await app.close(); await rm(deck, { recursive: true, force: true }); });
  // Fetch encodes ../ literally; the server normalizes and rejects.
  const res = await fetch(`http://127.0.0.1:${port}/..%2F..%2Fetc%2Fpasswd`);
  assert.equal(res.status, 403);
});

test('GET /vendor/reveal/reveal.js returns reveal.js source', async (t) => {
  const deck = await setupDeck();
  const app = await createServer({ deckDir: deck, sessionId: 'test-session', autoShutdown: false });
  await app.listen({ port: 0 });
  const port = (app.server.address() as { port: number }).port;
  t.after(async () => { await app.close(); await rm(deck, { recursive: true, force: true }); });
  const res = await fetch(`http://127.0.0.1:${port}/vendor/reveal/reveal.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /javascript/);
  const body = await res.text();
  assert.ok(body.includes('Reveal'), 'body should contain Reveal source');
});

test('sibling directory prefix collision is rejected (not just startsWith)', async (t) => {
  const deck = await mkdtemp(join(tmpdir(), 'deckmark-srv-'));
  // build is the served root; build-extras is a sibling that must NOT be reachable.
  await mkdir(join(deck, 'build'), { recursive: true });
  await mkdir(join(deck, 'build-extras'), { recursive: true });
  await writeFile(join(deck, 'build', 'index.html'), '<html><body></body></html>');
  await writeFile(join(deck, 'build-extras', 'secret.txt'), 'do not serve');
  const app = await createServer({ deckDir: deck, sessionId: 'test-session', autoShutdown: false });
  await app.listen({ port: 0 });
  const port = (app.server.address() as { port: number }).port;
  t.after(async () => { await app.close(); await rm(deck, { recursive: true, force: true }); });
  // Try ../build-extras/secret.txt
  const res = await fetch(`http://127.0.0.1:${port}/..%2Fbuild-extras%2Fsecret.txt`);
  assert.notEqual(res.status, 200);
});

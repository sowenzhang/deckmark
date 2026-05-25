// test/unit/publish.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDeck } from '../../runtime/engines/reveal.ts';
import { inlineHtml } from '../../runtime/publish/inline-html.ts';
import { multiFile } from '../../runtime/publish/multi-file.ts';

async function setupDeck() {
  const dir = await mkdtemp(join(tmpdir(), 'deckmark-pub-'));
  await writeFile(join(dir, 'content.md'), '# Slide One\n\nHello.\n\n---\n\n# Slide Two\n\nWorld.\n');
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  return dir;
}

test('inlineHtml inlines reveal.js + reveal.css into a single file', async () => {
  const dir = await setupDeck();
  const outFile = join(dir, 'deckmark.html');
  const r = await inlineHtml({ buildDir: join(dir, 'build'), outFile });
  const html = await readFile(outFile, 'utf8');
  assert.match(html, /<style[^>]+data-deckmark-inlined/);
  assert.match(html, /<script[^>]+data-deckmark-inlined/);
  assert.doesNotMatch(html, /<link[^>]+\/vendor\/reveal/);
  assert.doesNotMatch(html, /<script[^>]+src="\/vendor\/reveal/);
  assert.ok(r.bytes > 100_000, `expected sizable file, got ${r.bytes}`);
  await rm(dir, { recursive: true });
});

test('multiFile writes deploy folder with index.html and vendor/reveal/', async () => {
  const dir = await setupDeck();
  const outDir = join(dir, 'publish');
  const r = await multiFile({ buildDir: join(dir, 'build'), outDir });
  assert.ok(r.files.includes('index.html'));
  assert.ok(r.files.some(f => f.startsWith('vendor/reveal/')));
  await rm(dir, { recursive: true });
});

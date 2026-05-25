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

test('multiFile fails clearly when buildDir has a FILE at vendor (not a directory)', async () => {
  const dir = await setupDeck();
  // Tamper: drop a plain file at build/vendor so the reveal dist overlay
  // can't mkdir <outDir>/vendor/reveal on top of it. The engine's own sync
  // excludes 'vendor', but multiFile is callable with any buildDir.
  await writeFile(join(dir, 'build', 'vendor'), 'not-a-directory');
  const outDir = join(dir, 'publish-bad');
  await assert.rejects(
    () => multiFile({ buildDir: join(dir, 'build'), outDir }),
    /vendor.*not a directory/i
  );
  await rm(dir, { recursive: true });
});

test('inlineHtml refuses path-traversal references like vendor/reveal/../../etc', async () => {
  const dir = await setupDeck();
  // Tamper with the built HTML to inject a traversal reference. The
  // resolve() against REVEAL_DIST would land outside the reveal dist, and
  // without the containment guard the inliner would happily readFile()
  // whatever local file the user pointed at.
  const indexPath = join(dir, 'build', 'index.html');
  const orig = await readFile(indexPath, 'utf8');
  const tampered = orig
    .replace('href="vendor/reveal/reveal.css"', 'href="vendor/reveal/../../../../../../../etc/passwd"')
    .replace('src="vendor/reveal/reveal.js"', 'src="vendor/reveal/../../../../../../../etc/hosts"');
  await writeFile(indexPath, tampered, 'utf8');
  const outFile = join(dir, 'tampered.html');
  await inlineHtml({ buildDir: join(dir, 'build'), outFile });
  const html = await readFile(outFile, 'utf8');
  // The tampered hrefs should remain as plain <link>/<script> tags — not
  // replaced with inlined content. (We don't assert the file contents
  // weren't read, because the guard short-circuits before readFile.)
  assert.doesNotMatch(html, /data-deckmark-inlined="vendor\/reveal\/\.\.\//);
  // No /etc/* bytes ended up in the output, regardless of platform.
  assert.doesNotMatch(html, /root:x:/);
  await rm(dir, { recursive: true });
});

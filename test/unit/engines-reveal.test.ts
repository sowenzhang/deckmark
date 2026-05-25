import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildDeck } from '../../runtime/engines/reveal.ts';

async function tmpDir() {
  return await mkdtemp(join(tmpdir(), 'deckmark-eng-'));
}

const SAMPLE_CONTENT = `# Slide One

Hello world.

---

# Slide Two

- bullet a
- bullet b
`;

test('buildDeck produces index.html with both slides', async () => {
  const dir = await tmpDir();
  const contentPath = join(dir, 'content.md');
  await writeFile(contentPath, SAMPLE_CONTENT);
  await buildDeck({ contentPath, outDir: join(dir, 'build') });
  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /Slide One/);
  assert.match(html, /Slide Two/);
  assert.match(html, /<section[^>]*>[\s\S]*Slide One/);
  assert.match(html, /<section[^>]*>[\s\S]*Slide Two/);
  assert.match(html, /reveal\.js/);
  assert.match(html, /\/vendor\/reveal\/reveal\.js/);
  await rm(dir, { recursive: true });
});

test('buildDeck assigns sequential slide-index data attributes', async () => {
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), SAMPLE_CONTENT);
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /data-slide-index="0"/);
  assert.match(html, /data-slide-index="1"/);
  await rm(dir, { recursive: true });
});

test('buildDeck de-duplicates slugs when titles collide', async () => {
  const dir = await tmpDir();
  const content = `# Same Title\n\nA\n\n---\n\n# Same Title\n\nB\n`;
  await writeFile(join(dir, 'content.md'), content);
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /id="same-title"/);
  assert.match(html, /id="same-title-2"/);
  await rm(dir, { recursive: true });
});

test('buildDeck throws when content has no slides', async () => {
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), '\n\n---\n\n');
  await assert.rejects(
    () => buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') }),
    /no slides/i
  );
  await rm(dir, { recursive: true });
});

test('buildDeck sets data-mode on <html> and embeds the style sheet', async () => {
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), SAMPLE_CONTENT);
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build'), style: 'academic', mode: 'dark' });
  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /<html[^>]+data-mode="dark"/);
  assert.match(html, /data-deckmark-style="academic"/);
  assert.match(html, /data-deckmark-mode="dark"/);
  // dark mode loads the dark reveal base theme
  assert.match(html, /\/vendor\/reveal\/theme\/black\.css/);
  await rm(dir, { recursive: true });
});

test('buildDeck applies fragment-reveals by adding class="fragment" to list items', async () => {
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), SAMPLE_CONTENT);
  await buildDeck({
    contentPath: join(dir, 'content.md'),
    outDir: join(dir, 'build'),
    motion: ['fragment-reveals']
  });
  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /<li[^>]*class="[^"]*fragment[^"]*"/);
  await rm(dir, { recursive: true });
});

test('buildDeck with motion=[] disables transitions', async () => {
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), SAMPLE_CONTENT);
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build'), motion: [] });
  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /transition:\s*"none"/);
  await rm(dir, { recursive: true });
});

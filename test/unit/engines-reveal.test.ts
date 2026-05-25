import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
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
  // Relative (no leading slash) so file:// open also works after publish_deck.
  assert.match(html, /["']vendor\/reveal\/reveal\.js["']/);
  assert.doesNotMatch(html, /["']\/vendor\/reveal/);
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
  // dark mode loads the dark reveal base theme (relative path)
  assert.match(html, /["']vendor\/reveal\/theme\/black\.css["']/);
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

test('buildDeck mirrors user assets (images/) from deck folder into build/', async () => {
  const { mkdir, writeFile: w } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const dir = await tmpDir();
  // Set up a deck with an images/ subfolder containing a couple of files
  await mkdir(join(dir, 'images', 'nested'), { recursive: true });
  await w(join(dir, 'images', '1-0.jpg'), 'fake-jpeg-bytes');
  await w(join(dir, 'images', 'nested', 'deep.png'), '');
  await w(join(dir, 'content.md'), SAMPLE_CONTENT);
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  // After build, images/ should be mirrored inside build/
  assert.ok(existsSync(join(dir, 'build', 'images', '1-0.jpg')), 'images/1-0.jpg should be copied to build/');
  assert.ok(existsSync(join(dir, 'build', 'images', 'nested', 'deep.png')), 'nested image should be copied');
  await rm(dir, { recursive: true });
});

test('buildDeck skips nested symlinks during asset sync (security: no /etc/passwd via images/secret)', async () => {
  // Symlink creation on Windows usually requires either admin rights or
  // Developer Mode. If symlink() fails with EPERM we skip — the test is a
  // security regression check, not a portability test.
  const { mkdir, writeFile: w, symlink } = await import('node:fs/promises');
  const { existsSync, lstatSync } = await import('node:fs');
  const dir = await tmpDir();
  await mkdir(join(dir, 'images'), { recursive: true });
  await w(join(dir, 'images', 'real.jpg'), 'jpeg-bytes');
  // Drop a target file outside the deck and try to symlink to it from inside.
  // Name the target uniquely per run so concurrent tests don't collide on
  // a shared path under the OS temp dir.
  const outsideTarget = join(dir, '..', `sensitive-${basename(dir)}.txt`);
  await w(outsideTarget, 'SECRET');
  try {
    await symlink(outsideTarget, join(dir, 'images', 'leak'));
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EPERM' || e.code === 'ENOSYS') {
      await rm(dir, { recursive: true });
      await rm(outsideTarget, { force: true });
      return;
    }
    throw err;
  }
  await w(join(dir, 'content.md'), SAMPLE_CONTENT);
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  assert.ok(existsSync(join(dir, 'build', 'images', 'real.jpg')), 'real file should still be copied');
  assert.equal(
    existsSync(join(dir, 'build', 'images', 'leak')),
    false,
    'nested symlink must NOT be copied into build/'
  );
  // Sanity: the source symlink itself is in fact a symlink (so the test
  // would meaningfully fail if rejectSymlink stopped working).
  assert.ok(lstatSync(join(dir, 'images', 'leak')).isSymbolicLink());
  await rm(dir, { recursive: true });
  await rm(outsideTarget, { force: true });
});

test('buildDeck does NOT copy a custom-named content file (e.g. slides.md) into build/', async () => {
  const { writeFile: w } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const dir = await tmpDir();
  // Caller passes an arbitrary contentPath via the MCP layer — make sure the
  // sync excludes whatever basename was used, not just the literal 'content.md'.
  await w(join(dir, 'slides.md'), SAMPLE_CONTENT);
  await buildDeck({ contentPath: join(dir, 'slides.md'), outDir: join(dir, 'build') });
  assert.equal(
    existsSync(join(dir, 'build', 'slides.md')),
    false,
    'custom-named content markdown should NOT be copied into build/'
  );
  // sanity: index.html still produced from it
  assert.ok(existsSync(join(dir, 'build', 'index.html')));
  await rm(dir, { recursive: true });
});

test('buildDeck does not accidentally skip a deck folder whose name matches the outDir basename', async () => {
  const { mkdir, writeFile: w } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const deckDir = await tmpDir();
  // The deck legitimately has a folder called "output/" — it must be copied.
  await mkdir(join(deckDir, 'output'), { recursive: true });
  await w(join(deckDir, 'output', 'chart.png'), 'PNG');
  await w(join(deckDir, 'content.md'), SAMPLE_CONTENT);
  // Choose an outDir whose basename collides with the deck's 'output/' folder
  // but lives in a different parent — the old basename-based skip would have
  // dropped the deck's output/ on the floor.
  const outParent = await tmpDir();
  const outDir = join(outParent, 'output');
  await buildDeck({ contentPath: join(deckDir, 'content.md'), outDir });
  assert.ok(
    existsSync(join(outDir, 'output', 'chart.png')),
    "deck's output/ folder should be copied even when outDir basename is also 'output'"
  );
  await rm(deckDir, { recursive: true });
  await rm(outParent, { recursive: true });
});

test('buildDeck removes stale symlinks left in build/ from a prior build', async () => {
  const { mkdir, writeFile: w, symlink } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const dir = await tmpDir();
  await mkdir(join(dir, 'build', 'images'), { recursive: true });
  const outsideTarget = join(dir, '..', `stale-${basename(dir)}.txt`);
  await w(outsideTarget, 'STALE_SECRET');
  try {
    await symlink(outsideTarget, join(dir, 'build', 'images', 'leak'));
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EPERM' || e.code === 'ENOSYS') {
      await rm(dir, { recursive: true });
      await rm(outsideTarget, { force: true });
      return;
    }
    throw err;
  }
  await w(join(dir, 'content.md'), SAMPLE_CONTENT);
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  assert.equal(
    existsSync(join(dir, 'build', 'images', 'leak')),
    false,
    'stale symlink from a previous build must not survive a rebuild'
  );
  await rm(dir, { recursive: true });
  await rm(outsideTarget, { force: true });
});

test('buildDeck does NOT sync deckmark internals (AGENTS.md, annotations/, .gitignore, etc.) into build/', async () => {
  const { mkdir, writeFile: w } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const dir = await tmpDir();
  // Internals that should NOT be copied
  await w(join(dir, 'AGENTS.md'), '# agent instructions');
  await w(join(dir, 'deckmark.config.json'), '{}');
  await w(join(dir, '.gitignore'), 'build/\n');
  await mkdir(join(dir, 'annotations'), { recursive: true });
  await w(join(dir, 'annotations', 'session-stub.json'), '{}');
  // A user asset that SHOULD be copied
  await mkdir(join(dir, 'assets'), { recursive: true });
  await w(join(dir, 'assets', 'logo.svg'), '<svg/>');
  await w(join(dir, 'content.md'), SAMPLE_CONTENT);
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  assert.equal(existsSync(join(dir, 'build', 'AGENTS.md')), false);
  assert.equal(existsSync(join(dir, 'build', 'deckmark.config.json')), false);
  assert.equal(existsSync(join(dir, 'build', '.gitignore')), false);
  assert.equal(existsSync(join(dir, 'build', 'annotations')), false);
  assert.ok(existsSync(join(dir, 'build', 'assets', 'logo.svg')), 'user asset should be copied');
  await rm(dir, { recursive: true });
});

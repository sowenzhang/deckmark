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

test('buildDeck refuses to clean an outDir that contains the deck source', async () => {
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), SAMPLE_CONTENT);
  // outDir = the deck dir itself. Without the guard, rm({ recursive: true })
  // would wipe content.md before reading it. The guard must catch it before
  // any destructive call.
  await assert.rejects(
    () => buildDeck({ contentPath: join(dir, 'content.md'), outDir: dir }),
    /refusing to clean outDir/i
  );
  // Source survived the rejected call.
  const stillThere = await readFile(join(dir, 'content.md'), 'utf8');
  assert.match(stillThere, /Slide One/);
  await rm(dir, { recursive: true });
});

test('buildDeck refuses to clean a non-empty outDir without the .deckmark-build marker', async () => {
  const { mkdir, writeFile: w } = await import('node:fs/promises');
  const { existsSync } = await import('node:fs');
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), SAMPLE_CONTENT);
  // Pretend outDir is a user-owned folder with existing data — no marker.
  const outDir = join(dir, 'random-user-folder');
  await mkdir(outDir, { recursive: true });
  await w(join(outDir, 'family-photo.jpg'), 'JPEG_BYTES');
  await w(join(outDir, 'taxes.pdf'), 'PDF_BYTES');
  await assert.rejects(
    () => buildDeck({ contentPath: join(dir, 'content.md'), outDir }),
    /no \.deckmark-build marker/i
  );
  // Pre-existing user data survived.
  assert.ok(existsSync(join(outDir, 'family-photo.jpg')));
  assert.ok(existsSync(join(outDir, 'taxes.pdf')));
  await rm(dir, { recursive: true });
});

test('buildDeck cleans an outDir on repeated builds (marker round-trip)', async () => {
  const { existsSync } = await import('node:fs');
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), SAMPLE_CONTENT);
  // First build: outDir doesn't exist → succeeds, drops marker.
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  assert.ok(existsSync(join(dir, 'build', '.deckmark-build')));
  // Second build: outDir exists with marker → rm + rebuild → succeeds.
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  assert.ok(existsSync(join(dir, 'build', '.deckmark-build')));
  assert.ok(existsSync(join(dir, 'build', 'index.html')));
  await rm(dir, { recursive: true });
});

test('buildDeck refuses to clean filesystem root', async () => {
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), SAMPLE_CONTENT);
  // Pick a platform-appropriate root. The check is path-based so no actual
  // rm is attempted — we only need to confirm the guard fires.
  const root = process.platform === 'win32' ? 'C:\\' : '/';
  await assert.rejects(
    () => buildDeck({ contentPath: join(dir, 'content.md'), outDir: root }),
    /refusing to clean filesystem root/i
  );
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
  assert.match(html, /dm-fragment-subtle/);
  assert.match(html, /transition-property:\s*opacity,\s*transform/);
  await rm(dir, { recursive: true });
});

test('buildDeck supports engaging and cinematic motion styles', async () => {
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), SAMPLE_CONTENT);
  await buildDeck({
    contentPath: join(dir, 'content.md'),
    outDir: join(dir, 'build'),
    style: 'professional',
    motion: ['slide-transitions', 'fragment-reveals', 'auto-animate'],
    motionStyle: 'engaging'
  });

  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /data-motion-style="engaging"/);
  assert.match(html, /transition:\s*"slide"/);
  assert.match(html, /autoAnimateDuration:\s*0\.65/);
  assert.match(html, /dm-fragment-engaging/);

  await buildDeck({
    contentPath: join(dir, 'content.md'),
    outDir: join(dir, 'build'),
    style: 'academic',
    motion: ['slide-transitions'],
    motionStyle: 'cinematic'
  });
  const cinematic = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(cinematic, /data-motion-style="cinematic"/);
  assert.match(cinematic, /transition:\s*"fade"/);
  assert.match(cinematic, /autoAnimateDuration:\s*0\.9/);
  await rm(dir, { recursive: true });
});

test('buildDeck supports purposeful per-slide motion directives', async () => {
  const dir = await tmpDir();
  const content = `<!-- deckmark: transition=none fragments=none -->
# Quiet opening

Start without motion.

---

<!-- deckmark: transition=slide fragments=engaging auto-animate -->
# Build the decision

- Context
- Evidence
- Action
`;
  await writeFile(join(dir, 'content.md'), content);
  await buildDeck({
    contentPath: join(dir, 'content.md'),
    outDir: join(dir, 'build'),
    motion: [],
    motionStyle: 'subtle'
  });
  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /data-slide-title="Quiet opening"[^>]+data-transition="none"/);
  assert.match(html, /data-slide-title="Build the decision"[^>]+data-auto-animate[^>]+data-transition="slide"/);
  assert.equal((html.match(/data-auto-animate/g) ?? []).length, 2);
  assert.match(html, /dm-fragment-engaging/);
  assert.match(html, /data-deckmark-motion="slide-transitions,fragment-reveals,auto-animate"/);
  assert.match(html, /data-deckmark-content-hash="sha256:[a-f0-9]{64}"/);
  assert.match(html, /\.reveal \.fragment\.dm-fragment-engaging[^}]+transition-duration:\s*360ms/s);
  assert.match(html, /\.reveal \.fragment\.dm-fragment-engaging:not\(\.visible\)[^}]+translateX\(-0\.55em\)/s);
  assert.match(html, /\.reveal\.overview \.fragment\.dm-fragment[^}]+opacity:\s*1 !important[^}]+visibility:\s*visible !important[^}]+transform:\s*none !important/s);
  assert.match(html, /autoAnimate:\s*true/);
  assert.match(html, /fragments:\s*true/);
  assert.doesNotMatch(html, /deckmark:\s*transition/);
  await rm(dir, { recursive: true });
});

test('buildDeck ignores deckmark directive examples inside fenced code', async () => {
  const dir = await tmpDir();
  const content = `# Directive documentation

\`\`\`html
<!-- deckmark: transition=zoom fragments=cinematic auto-animate -->
\`\`\`
`;
  await writeFile(join(dir, 'content.md'), content);
  await buildDeck({
    contentPath: join(dir, 'content.md'),
    outDir: join(dir, 'build'),
    motion: []
  });
  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /data-deckmark-motion=""/);
  assert.doesNotMatch(html, /data-transition="zoom"/);
  assert.match(html, /&lt;!-- deckmark: transition=zoom/);
  await rm(dir, { recursive: true });
});

test('buildDeck with motion=[] disables transitions', async () => {
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), SAMPLE_CONTENT);
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build'), motion: [] });
  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /transition:\s*"none"/);
  assert.match(html, /data-deckmark-motion=""/);
  await rm(dir, { recursive: true });
});

test('buildDeck motion metadata cannot be spoofed by slide prose', async () => {
  const dir = await tmpDir();
  await writeFile(
    join(dir, 'content.md'),
    '# Configuration example\n\nWe set transition: "none" and fragments: true in the config.\n'
  );
  await buildDeck({
    contentPath: join(dir, 'content.md'),
    outDir: join(dir, 'build'),
    motion: ['slide-transitions']
  });

  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /data-deckmark-motion="slide-transitions"/);
  assert.doesNotMatch(html, /data-deckmark-motion="[^"]*fragment-reveals/);
  await rm(dir, { recursive: true });
});

test('buildDeck does not advertise fragment motion when no fragments were rendered', async () => {
  const dir = await tmpDir();
  await writeFile(
    join(dir, 'content.md'),
    '# Prose only\n\nThere are no list items on this slide.\n\n---\n\n# Still prose\n\nNo staged content here either.\n'
  );
  await buildDeck({
    contentPath: join(dir, 'content.md'),
    outDir: join(dir, 'build'),
    motion: ['slide-transitions', 'fragment-reveals']
  });
  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /data-deckmark-motion="slide-transitions"/);
  assert.match(html, /fragments:\s*false/);
  assert.doesNotMatch(html, /class="[^"]*\bfragment\b/);
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

test('buildDeck does not copy deckmark.brief.json into publishable build output', async () => {
  const { existsSync } = await import('node:fs');
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), SAMPLE_CONTENT);
  await writeFile(join(dir, 'deckmark.brief.json'), '{"audience":{"description":"private"}}');
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  assert.equal(existsSync(join(dir, 'build', 'deckmark.brief.json')), false);
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
  // Marker tells buildDeck "this dir is yours to clean" — simulates the
  // state left behind by a previous successful build.
  await w(join(dir, 'build', '.deckmark-build'), '');
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
  await mkdir(join(dir, '.deckmark', 'artifacts'), { recursive: true });
  await w(join(dir, '.deckmark', 'artifacts', 'draft-slide.png'), Buffer.alloc(128));
  // A user asset that SHOULD be copied
  await mkdir(join(dir, 'assets'), { recursive: true });
  await w(join(dir, 'assets', 'logo.svg'), '<svg/>');
  await w(join(dir, 'content.md'), SAMPLE_CONTENT);
  await buildDeck({ contentPath: join(dir, 'content.md'), outDir: join(dir, 'build') });
  assert.equal(existsSync(join(dir, 'build', 'AGENTS.md')), false);
  assert.equal(existsSync(join(dir, 'build', 'deckmark.config.json')), false);
  assert.equal(existsSync(join(dir, 'build', '.gitignore')), false);
  assert.equal(existsSync(join(dir, 'build', 'annotations')), false);
  assert.equal(existsSync(join(dir, 'build', '.deckmark')), false);
  assert.ok(existsSync(join(dir, 'build', 'assets', 'logo.svg')), 'user asset should be copied');
  await rm(dir, { recursive: true });
});

test('buildDeck appends custom CSS and supports custom HTML template placeholders', async () => {
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), SAMPLE_CONTENT);
  await writeFile(join(dir, 'custom.css'), '.custom-token { color: hotpink; }');
  await writeFile(join(dir, 'template.html'), `<!doctype html>
<html data-mode="{{DECKMARK_MODE}}">
<head>
  <link rel="stylesheet" href="{{DECKMARK_REVEAL_PREFIX}}/reveal.css">
  <style>{{DECKMARK_THEME_CSS}}</style>
</head>
<body>
  <main class="slides">{{DECKMARK_SLIDES}}</main>
  <script>{{DECKMARK_REVEAL_INIT}}</script>
</body>
</html>`);
  await buildDeck({
    contentPath: join(dir, 'content.md'),
    outDir: join(dir, 'build'),
    customCssPath: join(dir, 'custom.css'),
    templatePath: join(dir, 'template.html')
  });
  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /class="slides"/);
  assert.match(html, /data-mode="light"/);
  assert.match(html, /data-deckmark-style="professional"/);
  assert.match(html, /data-deckmark-content-hash="sha256:[a-f0-9]{64}"/);
  assert.match(html, /data-deckmark-motion="slide-transitions"/);
  assert.match(html, /\.custom-token \{ color: hotpink; \}/);
  assert.match(html, /\.reveal \.fragment\.dm-fragment/);
  assert.match(html, /Reveal\.initialize/);
  await rm(dir, { recursive: true });
});

test('buildDeck loads marked plugin modules', async () => {
  const dir = await tmpDir();
  await writeFile(join(dir, 'content.md'), '# Slide One\n\n[[plugin-token]]');
  await writeFile(join(dir, 'marked-plugin.mjs'), `export default function register(marked) {
  marked.use({
    hooks: {
      preprocess(markdown) {
        return markdown.replaceAll('[[plugin-token]]', '**from-plugin**');
      }
    }
  });
}`);
  await buildDeck({
    contentPath: join(dir, 'content.md'),
    outDir: join(dir, 'build'),
    markedPlugins: [join(dir, 'marked-plugin.mjs')]
  });
  const html = await readFile(join(dir, 'build', 'index.html'), 'utf8');
  assert.match(html, /<strong>from-plugin<\/strong>/);
  await rm(dir, { recursive: true });
});

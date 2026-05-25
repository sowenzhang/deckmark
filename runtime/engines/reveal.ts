import { mkdir, readFile, writeFile, readdir, cp, lstat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

// Relative (no leading slash) so the emitted HTML works both as served
// from the local review server AND as a standalone file:// open after
// publish_deck multi-file mode. The dev server's /vendor/reveal/* route
// still matches because the browser resolves the relative path against
// the page URL, which is the server root '/'.
const REVEAL_PREFIX = 'vendor/reveal';
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Names at the deck root that are deckmark/agent internals, NOT user assets.
 * Everything else (images/, fonts/, etc.) gets copied into build/ so the
 * rendered deck can reference assets via relative paths like
 * `<img src="images/foo.jpg">` and the local server can serve them.
 *
 * `vendor` is excluded so a user-provided `vendor/` folder cannot collide
 * with — or overwrite — the official reveal.js dist that publish_deck
 * (multi-file mode) places at `<outDir>/vendor/reveal/`.
 */
const EXCLUDED_FROM_ASSET_SYNC = new Set([
  'content.md',
  'deckmark.config.json',
  'annotations',
  'build',
  'published',
  'vendor',
  'node_modules',
  '.git',
  '.github',
  '.gitignore',
  '.claude-plugin',
  '.mcp.json',
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.codex',
  '.cursor'
]);

/**
 * cp() filter that rejects symlinks at any depth. Required because
 * `cp(..., { recursive: true })` without this would copy nested symlinks
 * verbatim (e.g. `images/secret -> /etc/passwd`); the static server then
 * follows them via stat()/readFile(), exposing arbitrary local files.
 *
 * `lstat` (not `stat`) is mandatory here — `stat` follows symlinks and
 * would report the target's type, defeating the check.
 */
async function rejectSymlink(src: string): Promise<boolean> {
  try {
    const st = await lstat(src);
    return !st.isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * Mirror non-internal files from the deck folder into build/ so the rendered
 * HTML can reference user assets (images, fonts, etc.) via stable relative
 * paths. Idempotent: re-running overwrites files in build/ but never deletes
 * extras (a removed asset in deckDir will still be served from build/ until
 * the next clean rebuild — acceptable for MVP).
 *
 * Symlinks are skipped at every depth (top-level entries + the `filter`
 * passed to cp()) to keep links like `images/secret -> /etc/passwd` out of
 * the published output. The static server has its own containment check,
 * but this is defense in depth.
 */
async function syncUserAssetsToBuild(deckDir: string, buildDir: string): Promise<void> {
  let entries: Dirent[];
  try {
    entries = await readdir(deckDir, { withFileTypes: true });
  } catch {
    return;
  }
  const buildBase = basename(buildDir);
  for (const e of entries) {
    // Hidden / dotfiles never sync.
    if (e.name.startsWith('.')) continue;
    if (EXCLUDED_FROM_ASSET_SYNC.has(e.name)) continue;
    // Don't sync the build dir itself (handles unusual outDir locations too).
    if (e.name === buildBase) continue;
    // Top-level .html and .tgz files are likely publish artifacts; skip.
    if (!e.isDirectory() && (e.name.endsWith('.html') || e.name.endsWith('.tgz'))) continue;
    // Fast path: skip top-level symlinks before recursing.
    if (e.isSymbolicLink()) continue;
    const src = join(deckDir, e.name);
    const dst = join(buildDir, e.name);
    // `filter` is applied to every src path cp() visits during recursion,
    // so nested symlinks are rejected too — not just top-level ones.
    await cp(src, dst, { recursive: true, force: true, filter: rejectSymlink });
  }
}

export type DeckStyle = 'professional' | 'academic' | 'fashion' | 'technical' | 'fun';
export type DeckMode = 'light' | 'dark';
export type DeckMotion = 'slide-transitions' | 'fragment-reveals' | 'auto-animate';

export interface BuildOpts {
  contentPath: string;
  outDir: string;
  style?: DeckStyle;
  mode?: DeckMode;
  motion?: DeckMotion[];
  /** Show slide numbers in the corner. Pass true for "current / total", a string for custom reveal.js format. */
  slideNumbers?: boolean | 'c' | 'c/t' | 'h.v' | 'h/v';
}

export interface BuildResult {
  outDir: string;
  slideCount: number;
  style: DeckStyle;
  mode: DeckMode;
  motion: DeckMotion[];
  slideNumbers: boolean | string;
}

interface StyleConfig {
  /** reveal.js base theme name (without .css extension) — light/dark of reveal's own theme stack. */
  baseTheme: { light: string; dark: string };
  /** preferred reveal.js transition when slide-transitions motion is enabled */
  transition: 'fade' | 'slide' | 'zoom' | 'convex' | 'concave';
}

const STYLES: Record<DeckStyle, StyleConfig> = {
  professional: { baseTheme: { light: 'white', dark: 'black' }, transition: 'fade' },
  academic:     { baseTheme: { light: 'white', dark: 'black' }, transition: 'fade' },
  fashion:      { baseTheme: { light: 'white', dark: 'black' }, transition: 'slide' },
  technical:    { baseTheme: { light: 'white', dark: 'black' }, transition: 'fade' },
  fun:          { baseTheme: { light: 'white', dark: 'black' }, transition: 'zoom' }
};

const DEFAULT_STYLE: DeckStyle = 'professional';
const DEFAULT_MODE: DeckMode = 'light';
const DEFAULT_MOTION: DeckMotion[] = ['slide-transitions'];

export async function buildDeck(opts: BuildOpts): Promise<BuildResult> {
  const style: DeckStyle = opts.style && STYLES[opts.style] ? opts.style : DEFAULT_STYLE;
  const mode: DeckMode = opts.mode === 'dark' ? 'dark' : DEFAULT_MODE;
  const motion: DeckMotion[] = Array.isArray(opts.motion) ? opts.motion : DEFAULT_MOTION;

  const config = STYLES[style];
  const baseTheme = config.baseTheme[mode];

  const slideTransitions = motion.includes('slide-transitions');
  const fragmentReveals = motion.includes('fragment-reveals');
  const autoAnimate = motion.includes('auto-animate');
  const slideNumbers: boolean | string = opts.slideNumbers ?? false;
  // reveal.js accepts `slideNumber: true | false | 'h.v' | 'h/v' | 'c' | 'c/t'`.
  // Map the truthy boolean to 'c/t' (current / total), which is the most useful default.
  const slideNumberValue: false | string = slideNumbers === false
    ? false
    : (slideNumbers === true ? 'c/t' : slideNumbers);

  const raw = await readFile(opts.contentPath, 'utf8');
  const blocks = raw.split(/^\s*---\s*$/m).map(s => s.trim()).filter(Boolean);
  if (blocks.length === 0) {
    throw new Error(`No slides in ${opts.contentPath}: file is empty or contains only separators`);
  }

  const slugCounts = new Map<string, number>();
  const sections = blocks.map((block, i) => {
    let html = marked.parse(block, { async: false }) as string;
    if (fragmentReveals) {
      html = applyFragmentReveals(html);
    }
    const titleMatch = block.match(/^#+\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : '';
    const baseSlug = title ? title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : '';
    const slug = uniqueSlug(slugCounts, baseSlug || `slide-${i}`);
    const autoAnimateAttr = autoAnimate ? ' data-auto-animate' : '';
    return `<section id="${slug}" data-slide-index="${i}" data-slide-title="${escapeAttr(title)}"${autoAnimateAttr}>${html}</section>`;
  });

  let deckmarkTheme = '';
  try {
    deckmarkTheme = await readFile(join(__dirname, 'themes', `${style}.css`), 'utf8');
  } catch {
    // theme file missing — engine still produces a valid (unstyled) deck
  }

  const transition = slideTransitions ? config.transition : 'none';

  const htmlDocument = `<!doctype html>
<html lang="en" data-mode="${mode}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>deckmark</title>
  <link rel="stylesheet" href="${REVEAL_PREFIX}/reveal.css">
  <link rel="stylesheet" href="${REVEAL_PREFIX}/theme/${baseTheme}.css" id="theme">
  <style data-deckmark-style="${style}" data-deckmark-mode="${mode}">
${deckmarkTheme}
  </style>
</head>
<body>
  <div class="reveal">
    <div class="slides">
${sections.join('\n')}
    </div>
  </div>
  <script src="${REVEAL_PREFIX}/reveal.js"></script>
  <script>
    window.__deckmarkReveal = Reveal;
    Reveal.initialize({
      hash: true,
      controlsLayout: 'edges',
      controlsBackArrows: 'faded',
      transition: ${JSON.stringify(transition)},
      center: false,
      width: '100%',
      height: '100%',
      margin: 0,
      autoAnimate: ${autoAnimate},
      fragments: ${fragmentReveals},
      slideNumber: ${JSON.stringify(slideNumberValue)}
    });
  </script>
</body>
</html>`;

  await mkdir(opts.outDir, { recursive: true });
  // Mirror user assets (images/, fonts/, etc.) from the deck folder into
  // build/ before writing index.html, so the rendered deck can reference
  // them via relative paths and so publish_deck (which reads from build/)
  // can find them for inlining or for multi-file deploy.
  await syncUserAssetsToBuild(dirname(opts.contentPath), opts.outDir);
  await writeFile(join(opts.outDir, 'index.html'), htmlDocument, 'utf8');
  return { outDir: opts.outDir, slideCount: sections.length, style, mode, motion, slideNumbers: slideNumberValue };
}

/** Mark list items as reveal.js fragments so they appear one at a time. */
function applyFragmentReveals(html: string): string {
  // Only apply to direct <li> elements; preserve any existing classes.
  return html.replace(/<li(\s[^>]*)?>/g, (match, attrs) => {
    const attr = attrs ?? '';
    if (/class\s*=/.test(attr)) {
      // append "fragment" to existing class list
      return match.replace(/class\s*=\s*"([^"]*)"/, (_m, cls) => `class="${cls} fragment"`);
    }
    return `<li${attr} class="fragment">`;
  });
}

export function listStyles(): DeckStyle[] {
  return Object.keys(STYLES) as DeckStyle[];
}

export function listMotions(): DeckMotion[] {
  return ['slide-transitions', 'fragment-reveals', 'auto-animate'];
}

function uniqueSlug(counts: Map<string, number>, base: string): string {
  const n = (counts.get(base) ?? 0) + 1;
  counts.set(base, n);
  return n === 1 ? base : `${base}-${n}`;
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

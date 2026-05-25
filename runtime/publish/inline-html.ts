// runtime/publish/inline-html.ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);

function dbg(msg: string): void {
  process.stderr.write(`[deckmark/inline] ${new Date().toISOString()} ${msg}\n`);
}

// Use Node's module resolver — reveal.js may be hoisted to a parent
// node_modules when deckmark is installed via npx. See static-overlay.ts.
const REVEAL_DIST = dirname(require.resolve('reveal.js/dist/reveal.js'));

/**
 * True only when `candidate` resolves to a file inside REVEAL_DIST (or is
 * REVEAL_DIST itself). Guards the inliner from path-traversal references
 * like `vendor/reveal/../../etc/passwd` that, after `resolve(REVEAL_DIST,
 * file)`, would land outside the reveal dist and could otherwise inline
 * arbitrary local files into the single-file HTML.
 */
function isUnderRevealDist(candidate: string): boolean {
  return candidate === REVEAL_DIST || candidate.startsWith(REVEAL_DIST + sep);
}

function mimeFor(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.svg': return 'image/svg+xml';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

export interface InlineOpts {
  buildDir: string;
  outFile: string;
}

export async function inlineHtml(opts: InlineOpts): Promise<{ outFile: string; bytes: number }> {
  dbg(`reading ${resolve(opts.buildDir, 'index.html')}`);
  let html = await readFile(resolve(opts.buildDir, 'index.html'), 'utf8');
  dbg(`source HTML: ${html.length} chars`);

  dbg(`inlining link stylesheets…`);
  html = await replaceLinkStylesheets(html);

  dbg(`inlining script src…`);
  html = await replaceScripts(html);

  dbg(`inlining images…`);
  html = await replaceImages(html, opts.buildDir);

  dbg(`writing ${opts.outFile} (${html.length} chars)`);
  await mkdir(dirname(opts.outFile), { recursive: true });
  await writeFile(opts.outFile, html, 'utf8');
  return { outFile: opts.outFile, bytes: Buffer.byteLength(html, 'utf8') };
}

async function replaceLinkStylesheets(html: string): Promise<string> {
  const re = /<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g;
  const matches = [...html.matchAll(re)];
  dbg(`  link matches: ${matches.length}`);
  for (const m of matches) {
    const href = m[1];
    // Accept both relative ('vendor/reveal/...') and absolute ('/vendor/reveal/...')
    // forms — engine now emits relative but old-published HTML may have absolute.
    const VENDOR_RE = /^\/?vendor\/reveal\//;
    if (!VENDOR_RE.test(href)) continue;
    const file = href.replace(VENDOR_RE, '');
    const src = resolve(REVEAL_DIST, file);
    if (!isUnderRevealDist(src)) { dbg(`  skip traversal: ${src}`); continue; }
    if (!existsSync(src)) { dbg(`  skip missing: ${src}`); continue; }
    const css = await readFile(src, 'utf8');
    html = html.replace(m[0], `<style data-deckmark-inlined="${href}">\n${css}\n</style>`);
    dbg(`  inlined CSS: ${href} (${css.length} chars)`);
  }
  return html;
}

async function replaceScripts(html: string): Promise<string> {
  const re = /<script[^>]+src="([^"]+)"[^>]*><\/script>/g;
  const matches = [...html.matchAll(re)];
  dbg(`  script matches: ${matches.length}`);
  for (const m of matches) {
    const src = m[1];
    const VENDOR_RE = /^\/?vendor\/reveal\//;
    if (!VENDOR_RE.test(src)) continue;
    const file = src.replace(VENDOR_RE, '');
    const filePath = resolve(REVEAL_DIST, file);
    if (!isUnderRevealDist(filePath)) { dbg(`  skip traversal: ${filePath}`); continue; }
    if (!existsSync(filePath)) { dbg(`  skip missing: ${filePath}`); continue; }
    const js = await readFile(filePath, 'utf8');
    html = html.replace(m[0], `<script data-deckmark-inlined="${src}">\n${js}\n</script>`);
    dbg(`  inlined JS: ${src} (${js.length} chars)`);
  }
  return html;
}

async function replaceImages(html: string, buildDir: string): Promise<string> {
  const re = /<img([^>]+)src="([^"]+)"([^>]*)>/g;
  const matches = [...html.matchAll(re)];
  dbg(`  img matches: ${matches.length}`);
  for (const m of matches) {
    const src = m[2];
    if (src.startsWith('data:') || src.startsWith('http://') || src.startsWith('https://')) {
      dbg(`  skip remote/data: ${src.slice(0, 60)}`);
      continue;
    }
    const file = src.replace(/^[/.]+/, '');
    const filePath = resolve(buildDir, file);
    if (!existsSync(filePath)) { dbg(`  skip missing local img: ${filePath}`); continue; }
    const ext = extname(filePath);
    const buf = await readFile(filePath);
    const data = `data:${mimeFor(ext)};base64,${buf.toString('base64')}`;
    html = html.replace(m[0], `<img${m[1]}src="${data}"${m[3]}>`);
    dbg(`  inlined img: ${src} (${buf.length} bytes)`);
  }
  return html;
}

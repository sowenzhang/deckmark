import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, normalize, dirname, sep, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import type { ServerOpts } from './factory.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findPackageRoot(start: string): string {
  let cur = start;
  while (cur !== dirname(cur)) {
    if (existsSync(join(cur, 'package.json'))) return cur;
    cur = dirname(cur);
  }
  throw new Error(`Could not find package.json walking up from ${start}`);
}

const PKG_ROOT = findPackageRoot(__dirname);
const OVERLAY_BUNDLE = resolve(PKG_ROOT, 'dist', 'overlay', 'overlay.js');
const OVERLAY_STYLES = resolve(PKG_ROOT, 'dist', 'overlay', 'styles.css');
const REVEAL_ROOT = resolve(PKG_ROOT, 'node_modules', 'reveal.js', 'dist');

const INJECTED_SCRIPT = '<script src="/overlay/overlay.js"></script>';

export async function registerStaticAndOverlay(
  app: FastifyInstance,
  opts: ServerOpts
): Promise<void> {
  app.get('/overlay/overlay.js', async (_req, reply) => {
    try {
      const code = await readFile(OVERLAY_BUNDLE, 'utf8');
      reply.header('content-type', 'application/javascript; charset=utf-8');
      return code;
    } catch {
      reply.code(500);
      reply.header('content-type', 'application/javascript; charset=utf-8');
      return '// overlay bundle missing; run `npm run build:overlay`';
    }
  });

  app.get('/overlay/styles.css', async (_req, reply) => {
    try {
      const css = await readFile(OVERLAY_STYLES, 'utf8');
      reply.header('content-type', 'text/css; charset=utf-8');
      return css;
    } catch {
      reply.code(404);
      return '';
    }
  });

  app.get('/vendor/reveal/*', async (req, reply) => {
    const reqPath = (req.params as { '*': string })['*'];
    const safe = normalize(reqPath).replace(/^[/\\]+/, '');
    const target = resolve(REVEAL_ROOT, safe);
    if (target !== REVEAL_ROOT && !target.startsWith(REVEAL_ROOT + sep)) {
      reply.code(403);
      return 'forbidden';
    }
    try {
      const body = await readFile(target);
      reply.header('content-type', contentTypeFor(target));
      return body;
    } catch {
      reply.code(404);
      return 'not found';
    }
  });

  app.get('/*', async (req, reply) => {
    const reqPath = (req.params as { '*': string })['*'] || 'index.html';
    const safe = normalize(reqPath).replace(/^[/\\]+/, '');
    const buildRoot = resolve(opts.deckDir, 'build');
    const target = resolve(buildRoot, safe);
    if (target !== buildRoot && !target.startsWith(buildRoot + sep)) {
      reply.code(403);
      return 'forbidden';
    }
    try {
      const st = await stat(target);
      if (!st.isFile()) {
        reply.code(404);
        return 'not found';
      }
      const body = await readFile(target);
      if (target.endsWith('.html')) {
        // Naive replace; assumes the deck engine emits one well-formed </body>.
        const html = body.toString('utf8');
        const injected = html.includes('</body>')
          ? html.replace('</body>', `${INJECTED_SCRIPT}</body>`)
          : html + INJECTED_SCRIPT;
        reply.header('content-type', 'text/html; charset=utf-8');
        return injected;
      }
      reply.header('content-type', contentTypeFor(target));
      return body;
    } catch {
      reply.code(404);
      return 'not found';
    }
  });
}

function contentTypeFor(path: string): string {
  if (path.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.json')) return 'application/json; charset=utf-8';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.jpg') || path.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

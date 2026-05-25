// runtime/publish/multi-file.ts
import { mkdir, cp, lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// Use Node's module resolver — reveal.js may be hoisted to a parent
// node_modules when deckmark is installed via npx. See static-overlay.ts.
const REVEAL_DIST = dirname(require.resolve('reveal.js/dist/reveal.js'));

/**
 * cp() filter that rejects symlinks at every depth. The engine's asset sync
 * already rejects symlinks before they reach buildDir, but multi-file may
 * also be invoked with a buildDir produced by other tooling. A
 * symlink-following web server (Apache/nginx default) would expose whatever
 * the symlink points at, so we belt-and-suspenders it here too.
 */
async function rejectSymlink(src: string): Promise<boolean> {
  try {
    const st = await lstat(src);
    return !st.isSymbolicLink();
  } catch {
    return false;
  }
}

export interface MultiFileOpts {
  buildDir: string;
  outDir: string;
}

export async function multiFile(opts: MultiFileOpts): Promise<{ outDir: string; files: string[] }> {
  await mkdir(opts.outDir, { recursive: true });

  // Order matters: copy buildDir FIRST (user assets, including any
  // user-named vendor/ that may have made it in), then overlay the
  // official reveal.js dist LAST. Whatever path collisions exist,
  // /vendor/reveal/* always reflects the real reveal.js — never user
  // content masquerading under the same path.
  await cp(opts.buildDir, opts.outDir, { recursive: true, force: true, filter: rejectSymlink });

  await mkdir(join(opts.outDir, 'vendor', 'reveal'), { recursive: true });
  await cp(REVEAL_DIST, join(opts.outDir, 'vendor', 'reveal'), { recursive: true, force: true, filter: rejectSymlink });

  // Walk the output to list what landed
  const { readdir } = await import('node:fs/promises');
  async function walk(dir: string, base = ''): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const e of entries) {
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) out.push(...(await walk(join(dir, e.name), rel)));
      else out.push(rel);
    }
    return out;
  }

  const files = await walk(opts.outDir);
  return { outDir: opts.outDir, files };
}

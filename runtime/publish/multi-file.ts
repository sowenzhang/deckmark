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

/**
 * Throw a clear error if `path` exists and is not a directory. Used before
 * `mkdir({ recursive: true })` calls that would otherwise fail with ENOTDIR
 * deep inside Node's internals — leaving the caller to figure out which
 * path was the problem.
 */
async function assertDirOrAbsent(path: string): Promise<void> {
  try {
    const st = await lstat(path);
    if (!st.isDirectory()) {
      throw new Error(
        `multiFile: ${path} exists but is not a directory; refusing to overwrite (remove it manually if intentional)`
      );
    }
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'ENOENT') return;
    throw err;
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

  // After the buildDir copy, the reveal dist is overlaid at <outDir>/vendor/reveal/.
  // If buildDir happened to contain a *file* (not a directory) at either
  // `vendor` or `vendor/reveal`, the subsequent mkdir({ recursive: true })
  // would throw ENOTDIR with no context. The engine's asset sync already
  // excludes `vendor`, but multiFile is callable with any buildDir, so
  // fail with a clear message instead of letting users debug a stat error.
  await assertDirOrAbsent(join(opts.outDir, 'vendor'));
  await assertDirOrAbsent(join(opts.outDir, 'vendor', 'reveal'));
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

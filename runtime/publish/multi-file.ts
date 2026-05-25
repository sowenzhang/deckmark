// runtime/publish/multi-file.ts
import { mkdir, cp } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findPackageRoot(start: string): string {
  let cur = start;
  while (cur !== dirname(cur)) {
    if (existsSync(join(cur, 'package.json'))) return cur;
    cur = dirname(cur);
  }
  throw new Error('package root not found');
}

const PKG_ROOT = findPackageRoot(__dirname);
const REVEAL_DIST = resolve(PKG_ROOT, 'node_modules', 'reveal.js', 'dist');

export interface MultiFileOpts {
  buildDir: string;
  outDir: string;
}

export async function multiFile(opts: MultiFileOpts): Promise<{ outDir: string; files: string[] }> {
  await mkdir(opts.outDir, { recursive: true });
  // Copy reveal.js dist contents to outDir/vendor/reveal/
  await mkdir(join(opts.outDir, 'vendor', 'reveal'), { recursive: true });
  await cp(REVEAL_DIST, join(opts.outDir, 'vendor', 'reveal'), { recursive: true });

  // Copy build/ contents (index.html and any embedded images) to outDir/
  await cp(opts.buildDir, opts.outDir, { recursive: true, force: true });

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

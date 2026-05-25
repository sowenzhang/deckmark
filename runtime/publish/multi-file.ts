// runtime/publish/multi-file.ts
import { mkdir, cp } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Use Node's module resolver — reveal.js may be hoisted to a parent
// node_modules when deckmark is installed via npx. See static-overlay.ts.
const REVEAL_DIST = dirname(require.resolve('reveal.js/dist/reveal.js'));

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

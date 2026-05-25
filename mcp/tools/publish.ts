// mcp/tools/publish.ts
import { resolve, basename } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { inlineHtml } from '../../runtime/publish/inline-html.ts';
import { multiFile } from '../../runtime/publish/multi-file.ts';

interface PublishInput {
  dir?: string;
  mode?: 'single-file' | 'multi-file';
  out?: string;
}

function dbg(msg: string): void {
  process.stderr.write(`[deckmark/publish] ${new Date().toISOString()} ${msg}\n`);
}

/** Derive a default output basename from the deck directory. e.g., 'q2-results-deck' → 'q2-results-deck'. */
function deckSlug(dir: string): string {
  const b = basename(resolve(dir));
  // Fall back if cwd is the root or an empty string
  return b && b !== '.' && b !== '/' ? b : 'deck';
}

export const publishDeckTool = {
  name: 'publish_deck',
  description:
    'Produce the final shareable deck. Always ask the user which mode they want before calling — do not silently default. single-file inlines reveal.js + theme + images into ONE .html file (~1-2 MB) that works when opened directly (file://); easier to email/copy/USB/attach. multi-file writes a "published/" folder with index.html + vendored assets; better for hosting (just upload the folder; cacheable assets; smaller individual files). Call after the user is satisfied — never before build_deck or during a review session.',
  inputSchema: {
    type: 'object',
    properties: {
      dir: { type: 'string', description: 'Project directory (defaults to cwd)' },
      mode: {
        type: 'string',
        enum: ['single-file', 'multi-file'],
        description: 'REQUIRED — ask the user. single-file = one .html (good for share/email/USB). multi-file = a published/ folder with index.html (good for hosting/CDN).'
      },
      out: {
        type: 'string',
        description: 'Optional output path. Defaults: single-file → <deck-name>.html in the project dir. multi-file → ./published/ (entry file: index.html).'
      }
    },
    required: ['mode']
  },
  handler: async (input: Record<string, unknown>) => {
    const opts = input as unknown as PublishInput;
    const cwd = opts.dir ? resolve(process.cwd(), opts.dir) : process.cwd();
    const buildDir = resolve(cwd, 'build');
    if (!opts.mode || (opts.mode !== 'single-file' && opts.mode !== 'multi-file')) {
      throw new Error('publish_deck: `mode` is required — ask the user "single-file or multi-file?" before calling.');
    }
    const mode = opts.mode;

    dbg(`begin: dir=${cwd} mode=${mode} out=${opts.out ?? '(default)'}`);

    // Sanity: build/index.html must exist before we publish anything
    const indexPath = resolve(buildDir, 'index.html');
    if (!existsSync(indexPath)) {
      dbg(`abort: ${indexPath} not found`);
      throw new Error(`publish_deck: ${indexPath} does not exist. Run build_deck first.`);
    }
    const sz = statSync(indexPath).size;
    if (sz < 200) {
      dbg(`abort: ${indexPath} is suspiciously small (${sz} bytes)`);
      throw new Error(`publish_deck: ${indexPath} is only ${sz} bytes. Run build_deck first to produce a real deck.`);
    }
    dbg(`build/index.html OK (${sz} bytes)`);

    try {
      if (mode === 'single-file') {
        const defaultName = `${deckSlug(cwd)}.html`;
        const outFile = resolve(cwd, opts.out ?? defaultName);
        dbg(`single-file mode → ${outFile}`);
        const r = await inlineHtml({ buildDir, outFile });
        dbg(`done: ${r.outFile} (${r.bytes} bytes)`);
        return { mode, out: r.outFile, bytes: r.bytes };
      } else {
        const outDir = resolve(cwd, opts.out ?? 'published');
        dbg(`multi-file mode → ${outDir}`);
        const r = await multiFile({ buildDir, outDir });
        dbg(`done: ${r.outDir} (${r.files.length} files) — entry: index.html`);
        return { mode, out: r.outDir, entry_file: 'index.html', file_count: r.files.length };
      }
    } catch (e) {
      dbg(`fail: ${(e as Error).message}`);
      throw e;
    }
  }
};

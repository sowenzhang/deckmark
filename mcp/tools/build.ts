// mcp/tools/build.ts
import { resolve } from 'node:path';
import {
  buildDeck,
  listStyles,
  listMotions,
  type DeckStyle,
  type DeckMode,
  type DeckMotion
} from '../../runtime/engines/reveal.ts';

interface BuildInput {
  dir?: string;
  content?: string;
  style?: DeckStyle;
  mode?: DeckMode;
  motion?: DeckMotion[];
  slideNumbers?: boolean | 'c' | 'c/t' | 'h.v' | 'h/v';
  customCss?: string;
  template?: string;
  markedPlugins?: string[];
}

export const buildDeckTool = {
  name: 'build_deck',
  description:
    'Render the content file to ./build/index.html. The visual design is controlled by three orthogonal axes: style (personality), mode (light/dark), motion (animations). Call after writing/editing content.md and again any time content or design changes.',
  inputSchema: {
    type: 'object',
    properties: {
      dir: { type: 'string', description: 'Project directory (defaults to cwd)' },
      content: { type: 'string', description: 'Content file name (defaults to content.md)' },
      style: {
        type: 'string',
        enum: listStyles(),
        default: 'professional',
        description: 'Visual personality. professional = restrained SaaS; academic = scholarly serif; fashion = brand launch / vision; technical = engineering / code-heavy; fun = casual / internal demo.'
      },
      mode: {
        type: 'string',
        enum: ['light', 'dark'],
        default: 'light',
        description: 'Color mode. Applies to all styles.'
      },
      motion: {
        type: 'array',
        items: { type: 'string', enum: listMotions() },
        default: ['slide-transitions'],
        description: 'Multi-select animation flags. slide-transitions = animate between slides (else jump). fragment-reveals = list items appear one at a time. auto-animate = matching elements morph between slides (for diagram build-ups). Pass [] to disable all motion.'
      },
      slideNumbers: {
        oneOf: [
          { type: 'boolean' },
          { type: 'string', enum: ['c', 'c/t', 'h.v', 'h/v'] }
        ],
        default: false,
        description: 'Show slide numbers. true → "current / total" (e.g. 3/8). false → off. Strings are passed through to reveal.js: c = current, c/t = current/total, h.v / h/v = horizontal+vertical indices.'
      },
      customCss: {
        type: 'string',
        description: 'Optional CSS file (relative to dir) appended after built-in style theme.'
      },
      template: {
        type: 'string',
        description: 'Optional HTML template file (relative to dir) using {{DECKMARK_*}} placeholders.'
      },
      markedPlugins: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional local module paths (relative to dir) exporting default/register(marked) to extend markdown rendering.'
      }
    }
  },
  handler: async (input: Record<string, unknown>) => {
    const opts = input as unknown as BuildInput;
    const cwd = opts.dir ? resolve(process.cwd(), opts.dir) : process.cwd();
    const contentPath = resolve(cwd, opts.content ?? 'content.md');
    const outDir = resolve(cwd, 'build');
    const result = await buildDeck({
      contentPath,
      outDir,
      style: opts.style,
      mode: opts.mode,
      motion: opts.motion,
      slideNumbers: opts.slideNumbers,
      customCssPath: opts.customCss ? resolve(cwd, opts.customCss) : undefined,
      templatePath: opts.template ? resolve(cwd, opts.template) : undefined,
      markedPlugins: opts.markedPlugins?.map(p => resolve(cwd, p))
    });
    return {
      out_dir: result.outDir,
      slide_count: result.slideCount,
      style: result.style,
      mode: result.mode,
      motion: result.motion,
      slide_numbers: result.slideNumbers
    };
  }
};

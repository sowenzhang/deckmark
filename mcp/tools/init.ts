// mcp/tools/init.ts
import { mkdir, writeFile, readFile } from 'node:fs/promises';
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
const TEMPLATE_ROOT = resolve(PKG_ROOT, 'runtime', 'templates');

function agentInstructionFilename(agent: string): string {
  switch (agent) {
    case 'claude': return 'CLAUDE.md';
    case 'codex': return 'AGENTS.md';
    case 'copilot': return '.github/copilot-instructions.md';
    case 'gemini': return 'GEMINI.md';
    default: return 'AGENTS.md';
  }
}

async function copyTemplate(src: string, dst: string): Promise<void> {
  const data = await readFile(join(TEMPLATE_ROOT, src), 'utf8');
  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, data, 'utf8');
}

interface InitInput {
  dir: string;
  agent?: 'claude' | 'codex' | 'copilot' | 'gemini' | 'generic';
}

export const initDeckTool = {
  name: 'init_deck',
  description:
    'Scaffold a new deckmark project at `dir`. Creates content.md, deckmark.brief.json, deckmark.config.json, .gitignore, and an agent instruction file. Call this once when the user asks to create a new presentation.',
  inputSchema: {
    type: 'object',
    properties: {
      dir: { type: 'string', description: 'Target directory (absolute or relative to cwd)' },
      agent: {
        type: 'string',
        enum: ['claude', 'codex', 'copilot', 'gemini', 'generic'],
        default: 'generic'
      }
    },
    required: ['dir']
  },
  handler: async (input: Record<string, unknown>) => {
    const opts = input as unknown as InitInput;
    const target = resolve(process.cwd(), opts.dir);
    await mkdir(target, { recursive: true });
    await mkdir(join(target, 'annotations'), { recursive: true });
    await mkdir(join(target, '.deckmark', 'artifacts'), { recursive: true });
    await copyTemplate('content.md', join(target, 'content.md'));
    await copyTemplate('deckmark.brief.json', join(target, 'deckmark.brief.json'));
    await copyTemplate('deckmark.config.json', join(target, 'deckmark.config.json'));
    await copyTemplate('gitignore', join(target, '.gitignore'));
    const instructionFile = agentInstructionFilename(opts.agent ?? 'generic');
    await copyTemplate('agent-instructions/generic.md', join(target, instructionFile));
    return {
      path: target,
      content_file: join(target, 'content.md'),
      brief_file: join(target, 'deckmark.brief.json'),
      config_file: join(target, 'deckmark.config.json'),
      instruction_file: join(target, instructionFile)
    };
  }
};

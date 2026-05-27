// cli/paths.ts
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Scope } from './types.ts';

export const skillName = 'deckmark';
export const commandFileName = 'use-deckmark.md';
export const mcpKey = 'deckmark';

function base(scope: Scope): string {
  return scope === 'global' ? homedir() : process.cwd();
}

export function configPath(scope: Scope): string {
  return scope === 'global'
    ? join(homedir(), '.claude.json')
    : join(process.cwd(), '.mcp.json');
}

export function skillsDir(scope: Scope): string {
  return join(base(scope), '.claude', 'skills');
}

export function commandsDir(scope: Scope): string {
  return join(base(scope), '.claude', 'commands');
}

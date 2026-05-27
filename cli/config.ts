// cli/config.ts
import { readFile, writeFile, rename } from 'node:fs/promises';

export interface McpEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface ConfigShape {
  mcpServers?: Record<string, McpEntry>;
  [k: string]: unknown;
}

export async function readConfig(path: string): Promise<ConfigShape> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw e;
  }
  try {
    return JSON.parse(text) as ConfigShape;
  } catch (e) {
    throw new Error(`Invalid JSON at ${path}: ${(e as Error).message}`);
  }
}

export async function writeConfigAtomic(path: string, obj: ConfigShape): Promise<void> {
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  await rename(tmp, path);
}

export function setMcpEntry(cfg: ConfigShape, key: string, entry: McpEntry): ConfigShape {
  const mcpServers = { ...(cfg.mcpServers ?? {}), [key]: entry };
  return { ...cfg, mcpServers };
}

export function removeMcpEntry(cfg: ConfigShape, key: string): ConfigShape {
  if (!cfg.mcpServers || !(key in cfg.mcpServers)) return cfg;
  const next = { ...cfg.mcpServers };
  delete next[key];
  return { ...cfg, mcpServers: next };
}

function envsEqual(a: Record<string, string> | undefined, b: Record<string, string> | undefined): boolean {
  const aKeys = Object.keys(a ?? {}).sort();
  const bKeys = Object.keys(b ?? {}).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
    if ((a ?? {})[aKeys[i]] !== (b ?? {})[bKeys[i]]) return false;
  }
  return true;
}

export function mcpEntriesEqual(a: McpEntry | undefined, b: McpEntry): boolean {
  if (!a) return false;
  if (a.command !== b.command) return false;
  const aArgs = a.args ?? [];
  const bArgs = b.args ?? [];
  if (aArgs.length !== bArgs.length) return false;
  if (!aArgs.every((v, i) => v === bArgs[i])) return false;
  if (!envsEqual(a.env, b.env)) return false;
  return true;
}

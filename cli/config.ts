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

export function mcpEntriesEqual(a: McpEntry | undefined, b: McpEntry): boolean {
  if (!a) return false;
  if (a.command !== b.command) return false;
  const aArgs = a.args ?? [];
  const bArgs = b.args ?? [];
  if (aArgs.length !== bArgs.length) return false;
  return aArgs.every((v, i) => v === bArgs[i]);
}

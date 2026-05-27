// cli/uninstall.ts
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rm, stat, readdir } from 'node:fs/promises';
import {
  configPath,
  skillsDir,
  commandsDir,
  skillName,
  commandFileName,
  mcpKey
} from './paths.ts';
import { readConfig, writeConfigAtomic, removeMcpEntry } from './config.ts';
import { fileHash } from './copy.ts';
import type { Options } from './types.ts';

function packageRoot(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const parent = dirname(here);
  return parent.endsWith('dist') ? dirname(parent) : parent;
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; }
  catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw e;
  }
}

async function dirsMatch(a: string, b: string): Promise<boolean> {
  // Compare file lists and hashes recursively. Both dirs must exist.
  const aFiles = await listFiles(a);
  const bFiles = await listFiles(b);
  if (aFiles.length !== bFiles.length) return false;
  for (let i = 0; i < aFiles.length; i++) {
    if (aFiles[i] !== bFiles[i]) return false;
    const ha = await fileHash(join(a, aFiles[i]));
    const hb = await fileHash(join(b, bFiles[i]));
    if (ha !== hb) return false;
  }
  return true;
}

async function listFiles(root: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const e of entries) {
    const rel = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.isDirectory()) {
      out.push(...await listFiles(join(root, e.name), rel));
    } else {
      out.push(rel);
    }
  }
  out.sort();
  return out;
}

export async function uninstall(opts: Options): Promise<void> {
  const root = packageRoot();

  const cfgPath = configPath(opts.scope);
  const skillSrc = join(root, 'skills', skillName);
  const skillDest = join(skillsDir(opts.scope), skillName);
  const cmdSrc = join(root, 'commands', commandFileName);
  const cmdDest = join(commandsDir(opts.scope), commandFileName);

  // --- Pre-flight: read config and run all hash comparisons BEFORE any writes ---

  // Step 1 (read-only): determine MCP presence
  const cfg = await readConfig(cfgPath);
  const mcpPresent = !!cfg.mcpServers?.[mcpKey];

  // Step 2 (read-only): check skill dir
  const skillExists = await exists(skillDest);
  if (skillExists && !opts.force) {
    if (!(await dirsMatch(skillSrc, skillDest))) {
      throw new Error(
        `skill at ${skillDest} differs from packaged version. ` +
        `Save your changes and re-run with --force.`
      );
    }
  }

  // Step 3 (read-only): check command file
  const cmdExists = await exists(cmdDest);
  if (cmdExists && !opts.force) {
    const same = (await fileHash(cmdSrc)) === (await fileHash(cmdDest));
    if (!same) {
      throw new Error(
        `command at ${cmdDest} differs from packaged version. ` +
        `Save your changes and re-run with --force.`
      );
    }
  }

  // --- Destructive work (all checks passed) ---

  // Step 1: remove MCP entry
  if (mcpPresent) {
    await writeConfigAtomic(cfgPath, removeMcpEntry(cfg, mcpKey));
    console.log(`✓ removed mcpServers.${mcpKey} from ${cfgPath}`);
  } else {
    console.log(`= mcpServers.${mcpKey} not present in ${cfgPath}`);
  }

  // Step 2: remove skill folder
  if (skillExists) {
    await rm(skillDest, { recursive: true, force: true });
    console.log(`✓ removed skill at ${skillDest}`);
  }

  // Step 3: remove slash command
  if (cmdExists) {
    await rm(cmdDest, { force: true });
    console.log(`✓ removed slash command at ${cmdDest}`);
  }
}

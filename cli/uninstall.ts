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
  try { await stat(p); return true; } catch { return false; }
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

  // Step 1: remove MCP entry
  const cfgPath = configPath(opts.scope);
  const cfg = await readConfig(cfgPath);
  if (cfg.mcpServers?.[mcpKey]) {
    await writeConfigAtomic(cfgPath, removeMcpEntry(cfg, mcpKey));
    console.log(`✓ removed mcpServers.${mcpKey} from ${cfgPath}`);
  } else {
    console.log(`= mcpServers.${mcpKey} not present in ${cfgPath}`);
  }

  // Step 2: remove skill folder (compare to package version first)
  const skillSrc = join(root, 'skills', skillName);
  const skillDest = join(skillsDir(opts.scope), skillName);
  if (await exists(skillDest)) {
    if (!opts.force && !(await dirsMatch(skillSrc, skillDest))) {
      throw new Error(
        `skill at ${skillDest} differs from packaged version. ` +
        `Save your changes and re-run with --force.`
      );
    }
    await rm(skillDest, { recursive: true, force: true });
    console.log(`✓ removed skill at ${skillDest}`);
  }

  // Step 3: remove slash command (single-file hash compare)
  const cmdSrc = join(root, 'commands', commandFileName);
  const cmdDest = join(commandsDir(opts.scope), commandFileName);
  if (await exists(cmdDest)) {
    if (!opts.force) {
      const same = (await fileHash(cmdSrc)) === (await fileHash(cmdDest));
      if (!same) {
        throw new Error(
          `command at ${cmdDest} differs from packaged version. ` +
          `Save your changes and re-run with --force.`
        );
      }
    }
    await rm(cmdDest, { force: true });
    console.log(`✓ removed slash command at ${cmdDest}`);
  }
}

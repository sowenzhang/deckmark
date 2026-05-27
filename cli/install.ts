// cli/install.ts
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';
import {
  configPath,
  skillsDir,
  commandsDir,
  skillName,
  commandFileName,
  mcpKey
} from './paths.ts';
import {
  readConfig,
  writeConfigAtomic,
  setMcpEntry,
  mcpEntriesEqual,
  type McpEntry
} from './config.ts';
import { copyDir, copyFile } from './copy.ts';
import type { Options } from './types.ts';

const MCP_ENTRY: McpEntry = {
  command: 'npx',
  args: ['-y', 'deckmark-mcp']
};

function packageRoot(): string {
  // cli/install.ts lives at <pkg>/dist/cli/install.js after build,
  // and at <pkg>/cli/install.ts when run via tsx (tests).
  // Both end in "cli", so disambiguate by checking the parent dir name.
  const here = dirname(fileURLToPath(import.meta.url));
  const parent = dirname(here);
  return parent.endsWith('dist') ? dirname(parent) : parent;
}

export async function install(opts: Options): Promise<void> {
  const root = packageRoot();
  const created: string[] = [];

  try {
    // Step 1: register MCP
    const cfgPath = configPath(opts.scope);
    const cfg = await readConfig(cfgPath);
    const existing = cfg.mcpServers?.[mcpKey];
    if (mcpEntriesEqual(existing, MCP_ENTRY)) {
      console.log(`= MCP entry already present in ${cfgPath}`);
    } else if (existing && !opts.force) {
      throw new Error(
        `mcpServers.${mcpKey} already set to a different value in ${cfgPath}. ` +
        `Re-run with --force to overwrite.`
      );
    } else {
      await writeConfigAtomic(cfgPath, setMcpEntry(cfg, mcpKey, MCP_ENTRY));
      console.log(`✓ MCP registered in ${cfgPath}`);
    }

    // Step 2: copy skill folder
    const skillSrc = join(root, 'skills', skillName);
    const skillDest = join(skillsDir(opts.scope), skillName);
    await copyDir(skillSrc, skillDest, { force: opts.force });
    created.push(skillDest);
    console.log(`✓ skill installed to ${skillDest}`);

    // Step 3: copy slash command
    const cmdSrc = join(root, 'commands', commandFileName);
    const cmdDest = join(commandsDir(opts.scope), commandFileName);
    await copyFile(cmdSrc, cmdDest, { force: opts.force });
    created.push(cmdDest);
    console.log(`✓ slash command installed to ${cmdDest}`);

    console.log(`\nDone. Start a Claude Code session and type /use-deckmark.`);
  } catch (err) {
    // Roll back any files we successfully copied
    for (const p of created.reverse()) {
      await rm(p, { recursive: true, force: true });
    }
    throw err;
  }
}

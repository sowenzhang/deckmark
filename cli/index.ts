#!/usr/bin/env node
// cli/index.ts
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './argv.ts';
import { install } from './install.ts';
import { uninstall } from './uninstall.ts';

const USAGE = `\
Usage:
  npx deckmark install [--project] [--force]
  npx deckmark uninstall [--project] [--force]
  npx deckmark --help
  npx deckmark --version

Options:
  --project    Install to the current directory instead of $HOME.
  --force      Overwrite existing files on install; bypass modified-file check on uninstall.
`;

async function readPackageVersion(): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  const parent = dirname(here);
  const root = parent.endsWith('dist') ? dirname(parent) : parent;
  const text = await readFile(join(root, 'package.json'), 'utf8');
  return (JSON.parse(text) as { version: string }).version;
}

async function main(): Promise<void> {
  const cmd = parseArgs(process.argv.slice(2));

  switch (cmd.kind) {
    case 'help':
      process.stdout.write(USAGE);
      return;
    case 'version': {
      const v = await readPackageVersion();
      process.stdout.write(`${v}\n`);
      return;
    }
    case 'install':
      await install(cmd.options);
      return;
    case 'uninstall':
      await uninstall(cmd.options);
      return;
    case 'error':
      process.stderr.write(`Error: ${cmd.message}\n\n${USAGE}`);
      process.exit(2);
  }
}

main().catch((e) => {
  process.stderr.write(`Error: ${(e as Error).message}\n`);
  process.exit(1);
});

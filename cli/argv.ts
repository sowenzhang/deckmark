// cli/argv.ts
import type { Command, Options, Scope } from './types.ts';

function parseOptions(rest: string[]): { ok: true; options: Options } | { ok: false; bad: string } {
  let scope: Scope = 'global';
  let force = false;
  for (const a of rest) {
    if (a === '--project') scope = 'project';
    else if (a === '--force') force = true;
    else return { ok: false, bad: a };
  }
  return { ok: true, options: { scope, force } };
}

export function parseArgs(argv: string[]): Command {
  if (argv.length === 0) return { kind: 'help' };

  const [first, ...rest] = argv;

  if (first === '--help' || first === '-h') return { kind: 'help' };
  if (first === '--version' || first === '-v') return { kind: 'version' };

  if (first === 'install' || first === 'uninstall') {
    const r = parseOptions(rest);
    if (!r.ok) return { kind: 'error', message: `unknown flag: ${r.bad}` };
    return { kind: first, options: r.options };
  }

  return { kind: 'error', message: `unknown command: ${first}` };
}

# Standalone `npx deckmark install` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `deckmark` CLI bin with `install` / `uninstall` subcommands so end users can register the MCP server, skill, and slash command via `npx -y deckmark install` instead of going through the Claude Code plugin marketplace.

**Architecture:** New top-level `cli/` directory mirrors the existing `mcp/` convention. The CLI is a thin orchestrator over four small pure-ish modules: `paths` (target path resolution), `config` (atomic JSON patch), `copy` (skill+command file copy with idempotency), and `install`/`uninstall` (orchestration). Existing MCP server (`mcp/server.ts` → `dist/mcp/server.js`) is unchanged. Package gains a second `bin` entry (`deckmark` → `dist/cli/index.js`) and gets published to npm so the MCP can be invoked as `npx -y deckmark-mcp`.

**Tech Stack:** Node 22+, TypeScript (existing `tsconfig.json`), `node:test` for tests, `tsx` for TS execution, no new runtime deps.

**Spec:** `docs/specs/2026-05-27-standalone-installer-design.md`

---

## File Structure

**New files (all under `cli/` unless noted):**

| Path | Responsibility |
|------|----------------|
| `cli/paths.ts` | Resolve target paths (global vs project) for config, skills, commands |
| `cli/config.ts` | Atomic read / patch / write of `~/.claude.json` or `.mcp.json` |
| `cli/copy.ts` | Copy skill folder + slash-command file, with overwrite policy |
| `cli/install.ts` | Orchestrate the 3 install steps; track artifacts for rollback |
| `cli/uninstall.ts` | Orchestrate uninstall; honor modified-file check |
| `cli/argv.ts` | Parse `process.argv` into a typed `Command` object |
| `cli/index.ts` | Entry bin (`#!/usr/bin/env node`); dispatch to install/uninstall |
| `cli/types.ts` | Shared types: `Scope = "global" \| "project"`, `Options`, `Command` |
| `test/unit/cli-paths.test.ts` | Unit tests for `paths.ts` |
| `test/unit/cli-config.test.ts` | Unit tests for `config.ts` |
| `test/unit/cli-copy.test.ts` | Unit tests for `copy.ts` |
| `test/unit/cli-argv.test.ts` | Unit tests for `argv.ts` |
| `test/integration/cli-install.test.ts` | End-to-end install + uninstall against a temp HOME |

**Modified files:**

| Path | Change |
|------|--------|
| `package.json` | Add `bin.deckmark`; ensure `dist/cli/` ships via `files` |
| `tsconfig.json` | Add `cli/**/*.ts` to `include` |
| `README.md` | New "Install" section; demote marketplace to a `<details>` block |
| `.github/workflows/release.yml` | Add `npm publish --access public` step gated on `NPM_TOKEN` |

---

## Task 1: Scaffold cli/ directory and wire tsconfig

**Files:**
- Create: `cli/types.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Add `cli/**/*.ts` to tsconfig include**

Edit `tsconfig.json`, change the `include` array from:

```json
"include": ["runtime/**/*.ts", "mcp/**/*.ts"],
```

to:

```json
"include": ["runtime/**/*.ts", "mcp/**/*.ts", "cli/**/*.ts"],
```

- [ ] **Step 2: Create `cli/types.ts`**

```typescript
// cli/types.ts
export type Scope = 'global' | 'project';

export interface Options {
  scope: Scope;
  force: boolean;
}

export interface InstallCommand {
  kind: 'install';
  options: Options;
}

export interface UninstallCommand {
  kind: 'uninstall';
  options: Options;
}

export interface HelpCommand {
  kind: 'help';
}

export interface VersionCommand {
  kind: 'version';
}

export interface ErrorCommand {
  kind: 'error';
  message: string;
}

export type Command =
  | InstallCommand
  | UninstallCommand
  | HelpCommand
  | VersionCommand
  | ErrorCommand;
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: No errors. (The new file has no logic to fail.)

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json cli/types.ts
git commit -m "feat(cli): scaffold cli directory and types"
```

---

## Task 2: paths.ts — resolve install targets

**Files:**
- Create: `cli/paths.ts`
- Test: `test/unit/cli-paths.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/cli-paths.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { configPath, skillsDir, commandsDir, skillName } from '../../cli/paths.ts';

test('configPath returns ~/.claude.json for global scope', () => {
  assert.equal(configPath('global'), join(homedir(), '.claude.json'));
});

test('configPath returns ./.mcp.json for project scope', () => {
  assert.equal(configPath('project'), join(process.cwd(), '.mcp.json'));
});

test('skillsDir returns ~/.claude/skills for global scope', () => {
  assert.equal(skillsDir('global'), join(homedir(), '.claude', 'skills'));
});

test('skillsDir returns ./.claude/skills for project scope', () => {
  assert.equal(skillsDir('project'), join(process.cwd(), '.claude', 'skills'));
});

test('commandsDir returns ~/.claude/commands for global scope', () => {
  assert.equal(commandsDir('global'), join(homedir(), '.claude', 'commands'));
});

test('commandsDir returns ./.claude/commands for project scope', () => {
  assert.equal(commandsDir('project'), join(process.cwd(), '.claude', 'commands'));
});

test('skillName is the literal "deckmark"', () => {
  assert.equal(skillName, 'deckmark');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test test/unit/cli-paths.test.ts`
Expected: FAIL — module `cli/paths.ts` not found.

- [ ] **Step 3: Implement `cli/paths.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/unit/cli-paths.test.ts`
Expected: PASS — 7/7 tests.

- [ ] **Step 5: Commit**

```bash
git add cli/paths.ts test/unit/cli-paths.test.ts
git commit -m "feat(cli): add paths module for scope-based target resolution"
```

---

## Task 3: config.ts — atomic JSON read/patch/write

**Files:**
- Create: `cli/config.ts`
- Test: `test/unit/cli-config.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/cli-config.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig, writeConfigAtomic, setMcpEntry, removeMcpEntry } from '../../cli/config.ts';

async function tmp() {
  return await mkdtemp(join(tmpdir(), 'deckmark-cfg-'));
}

test('readConfig returns {} when file does not exist', async () => {
  const dir = await tmp();
  const got = await readConfig(join(dir, 'nope.json'));
  assert.deepEqual(got, {});
  await rm(dir, { recursive: true, force: true });
});

test('readConfig parses existing JSON', async () => {
  const dir = await tmp();
  const p = join(dir, 'c.json');
  await writeFile(p, JSON.stringify({ mcpServers: { x: { command: 'foo' } } }));
  const got = await readConfig(p);
  assert.deepEqual(got, { mcpServers: { x: { command: 'foo' } } });
  await rm(dir, { recursive: true, force: true });
});

test('readConfig throws on invalid JSON without modifying file', async () => {
  const dir = await tmp();
  const p = join(dir, 'bad.json');
  await writeFile(p, '{ not valid');
  await assert.rejects(() => readConfig(p), /Invalid JSON/);
  // Original content untouched
  assert.equal(await readFile(p, 'utf8'), '{ not valid');
  await rm(dir, { recursive: true, force: true });
});

test('writeConfigAtomic writes JSON with trailing newline', async () => {
  const dir = await tmp();
  const p = join(dir, 'out.json');
  await writeConfigAtomic(p, { hello: 'world' });
  const text = await readFile(p, 'utf8');
  assert.equal(text, '{\n  "hello": "world"\n}\n');
  await rm(dir, { recursive: true, force: true });
});

test('setMcpEntry adds entry preserving other keys', () => {
  const cfg = { otherKey: 1, mcpServers: { existing: { command: 'x' } } };
  const next = setMcpEntry(cfg, 'deckmark', { command: 'npx', args: ['-y', 'deckmark-mcp'] });
  assert.deepEqual(next, {
    otherKey: 1,
    mcpServers: {
      existing: { command: 'x' },
      deckmark: { command: 'npx', args: ['-y', 'deckmark-mcp'] }
    }
  });
});

test('setMcpEntry creates mcpServers when missing', () => {
  const cfg = {};
  const next = setMcpEntry(cfg, 'deckmark', { command: 'npx', args: ['-y', 'deckmark-mcp'] });
  assert.deepEqual(next, {
    mcpServers: { deckmark: { command: 'npx', args: ['-y', 'deckmark-mcp'] } }
  });
});

test('removeMcpEntry removes key, leaves empty mcpServers object', () => {
  const cfg = { mcpServers: { deckmark: { command: 'x' } } };
  const next = removeMcpEntry(cfg, 'deckmark');
  assert.deepEqual(next, { mcpServers: {} });
});

test('removeMcpEntry on missing key is a no-op', () => {
  const cfg = { mcpServers: { other: { command: 'x' } } };
  const next = removeMcpEntry(cfg, 'deckmark');
  assert.deepEqual(next, { mcpServers: { other: { command: 'x' } } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test test/unit/cli-config.test.ts`
Expected: FAIL — module `cli/config.ts` not found.

- [ ] **Step 3: Implement `cli/config.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/unit/cli-config.test.ts`
Expected: PASS — 8/8 tests.

- [ ] **Step 5: Commit**

```bash
git add cli/config.ts test/unit/cli-config.test.ts
git commit -m "feat(cli): add atomic config patch module"
```

---

## Task 4: copy.ts — copy skill folder and slash command

**Files:**
- Create: `cli/copy.ts`
- Test: `test/unit/cli-copy.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/cli-copy.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, mkdir, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copyDir, copyFile, fileHash } from '../../cli/copy.ts';

async function tmp() {
  return await mkdtemp(join(tmpdir(), 'deckmark-cp-'));
}

test('copyDir copies a folder recursively', async () => {
  const src = await tmp();
  const dest = join(await tmp(), 'dest');
  await mkdir(join(src, 'sub'), { recursive: true });
  await writeFile(join(src, 'a.txt'), 'A');
  await writeFile(join(src, 'sub', 'b.txt'), 'B');

  await copyDir(src, dest, { force: false });

  assert.equal(await readFile(join(dest, 'a.txt'), 'utf8'), 'A');
  assert.equal(await readFile(join(dest, 'sub', 'b.txt'), 'utf8'), 'B');
  await rm(src, { recursive: true, force: true });
  await rm(dest, { recursive: true, force: true });
});

test('copyDir refuses to overwrite when dest exists and force=false', async () => {
  const src = await tmp();
  const dest = await tmp();
  await writeFile(join(src, 'a.txt'), 'new');
  await writeFile(join(dest, 'sentinel'), 'keep');

  await assert.rejects(
    () => copyDir(src, dest, { force: false }),
    /already exists/
  );
  // Existing file untouched
  assert.equal(await readFile(join(dest, 'sentinel'), 'utf8'), 'keep');
  await rm(src, { recursive: true, force: true });
  await rm(dest, { recursive: true, force: true });
});

test('copyDir overwrites when force=true', async () => {
  const src = await tmp();
  const dest = await tmp();
  await writeFile(join(src, 'a.txt'), 'new');
  await writeFile(join(dest, 'a.txt'), 'old');

  await copyDir(src, dest, { force: true });

  assert.equal(await readFile(join(dest, 'a.txt'), 'utf8'), 'new');
  await rm(src, { recursive: true, force: true });
  await rm(dest, { recursive: true, force: true });
});

test('copyFile creates parent directory', async () => {
  const dir = await tmp();
  const src = join(dir, 'src.md');
  await writeFile(src, 'hello');
  const dest = join(dir, 'new', 'nested', 'dest.md');

  await copyFile(src, dest, { force: false });

  assert.equal(await readFile(dest, 'utf8'), 'hello');
  await rm(dir, { recursive: true, force: true });
});

test('copyFile refuses to overwrite when dest exists and force=false', async () => {
  const dir = await tmp();
  const src = join(dir, 'src.md');
  const dest = join(dir, 'dest.md');
  await writeFile(src, 'new');
  await writeFile(dest, 'old');

  await assert.rejects(() => copyFile(src, dest, { force: false }), /already exists/);
  assert.equal(await readFile(dest, 'utf8'), 'old');
  await rm(dir, { recursive: true, force: true });
});

test('fileHash produces stable sha256 for same content', async () => {
  const dir = await tmp();
  const p = join(dir, 'a.txt');
  await writeFile(p, 'hello');
  const h1 = await fileHash(p);
  const h2 = await fileHash(p);
  assert.equal(h1, h2);
  assert.match(h1, /^[a-f0-9]{64}$/);
  await rm(dir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test test/unit/cli-copy.test.ts`
Expected: FAIL — module `cli/copy.ts` not found.

- [ ] **Step 3: Implement `cli/copy.ts`**

```typescript
// cli/copy.ts
import { cp, mkdir, copyFile as nodeCopyFile, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';

export interface CopyOptions {
  force: boolean;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function copyDir(src: string, dest: string, opts: CopyOptions): Promise<void> {
  if (!opts.force && (await exists(dest))) {
    throw new Error(`destination already exists: ${dest} (use --force to overwrite)`);
  }
  await cp(src, dest, { recursive: true, force: true });
}

export async function copyFile(src: string, dest: string, opts: CopyOptions): Promise<void> {
  if (!opts.force && (await exists(dest))) {
    throw new Error(`destination already exists: ${dest} (use --force to overwrite)`);
  }
  await mkdir(dirname(dest), { recursive: true });
  await nodeCopyFile(src, dest);
}

export async function fileHash(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash('sha256').update(buf).digest('hex');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/unit/cli-copy.test.ts`
Expected: PASS — 6/6 tests.

- [ ] **Step 5: Commit**

```bash
git add cli/copy.ts test/unit/cli-copy.test.ts
git commit -m "feat(cli): add copy helpers with overwrite policy and content hash"
```

---

## Task 5: argv.ts — parse process.argv into a Command

**Files:**
- Create: `cli/argv.ts`
- Test: `test/unit/cli-argv.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/unit/cli-argv.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseArgs } from '../../cli/argv.ts';

test('parses bare install as global non-force', () => {
  const cmd = parseArgs(['install']);
  assert.deepEqual(cmd, { kind: 'install', options: { scope: 'global', force: false } });
});

test('parses install --project as project scope', () => {
  const cmd = parseArgs(['install', '--project']);
  assert.deepEqual(cmd, { kind: 'install', options: { scope: 'project', force: false } });
});

test('parses install --force', () => {
  const cmd = parseArgs(['install', '--force']);
  assert.deepEqual(cmd, { kind: 'install', options: { scope: 'global', force: true } });
});

test('parses install --project --force in any order', () => {
  const a = parseArgs(['install', '--project', '--force']);
  const b = parseArgs(['install', '--force', '--project']);
  assert.deepEqual(a, b);
  assert.equal(a.kind, 'install');
});

test('parses uninstall same as install', () => {
  const cmd = parseArgs(['uninstall', '--project']);
  assert.deepEqual(cmd, { kind: 'uninstall', options: { scope: 'project', force: false } });
});

test('parses --help', () => {
  assert.deepEqual(parseArgs(['--help']), { kind: 'help' });
  assert.deepEqual(parseArgs(['-h']), { kind: 'help' });
});

test('parses --version', () => {
  assert.deepEqual(parseArgs(['--version']), { kind: 'version' });
  assert.deepEqual(parseArgs(['-v']), { kind: 'version' });
});

test('no args yields help', () => {
  assert.deepEqual(parseArgs([]), { kind: 'help' });
});

test('unknown subcommand yields error', () => {
  const cmd = parseArgs(['frobnicate']);
  assert.equal(cmd.kind, 'error');
});

test('unknown flag yields error', () => {
  const cmd = parseArgs(['install', '--unknown']);
  assert.equal(cmd.kind, 'error');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test test/unit/cli-argv.test.ts`
Expected: FAIL — module `cli/argv.ts` not found.

- [ ] **Step 3: Implement `cli/argv.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test test/unit/cli-argv.test.ts`
Expected: PASS — 10/10 tests.

- [ ] **Step 5: Commit**

```bash
git add cli/argv.ts test/unit/cli-argv.test.ts
git commit -m "feat(cli): add argv parser for install/uninstall/help/version"
```

---

## Task 6: install.ts — orchestrate the three install steps

**Files:**
- Create: `cli/install.ts`

This module has no dedicated unit test because it is pure orchestration — its components (`paths`, `config`, `copy`) are each tested in isolation. End-to-end coverage comes from the integration test in Task 9.

- [ ] **Step 1: Find the package root at runtime**

We need to copy files *from the installed package*, not from `process.cwd()`. The installed location of the CLI on a user machine is `<npm-cache>/.../node_modules/deckmark/dist/cli/index.js`, so the package root is two `dirname` calls above `import.meta.url`.

- [ ] **Step 2: Implement `cli/install.ts`**

```typescript
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
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add cli/install.ts
git commit -m "feat(cli): implement install orchestrator with rollback"
```

---

## Task 7: uninstall.ts — reverse the install, honor user edits

**Files:**
- Create: `cli/uninstall.ts`

- [ ] **Step 1: Implement `cli/uninstall.ts`**

```typescript
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
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add cli/uninstall.ts
git commit -m "feat(cli): implement uninstall with modified-file protection"
```

---

## Task 8: index.ts — CLI entry point

**Files:**
- Create: `cli/index.ts`

- [ ] **Step 1: Implement `cli/index.ts`**

```typescript
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
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc -p tsconfig.json --noEmit`
Expected: No errors.

- [ ] **Step 3: Verify CLI starts via tsx (smoke test)**

Run: `node --import tsx cli/index.ts --help`
Expected: Prints the `USAGE` block and exits 0.

Run: `node --import tsx cli/index.ts --version`
Expected: Prints `1.0.0` (matching `package.json` version).

Run: `node --import tsx cli/index.ts frobnicate`
Expected: Prints `Error: unknown command: frobnicate` to stderr; exit code 2.

- [ ] **Step 4: Commit**

```bash
git add cli/index.ts
git commit -m "feat(cli): add entry point with help, version, and error handling"
```

---

## Task 9: End-to-end integration test

**Files:**
- Test: `test/integration/cli-install.test.ts`

This test exercises the full install→uninstall cycle against a temp directory acting as `HOME`, isolating the test from the real user environment. It validates the orchestration in `install.ts` and `uninstall.ts` against the real `paths`, `config`, and `copy` modules.

- [ ] **Step 1: Write the test**

```typescript
// test/integration/cli-install.test.ts
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// We monkey-patch os.homedir via env var override pattern: install/uninstall
// read homedir() at call time, so we set HOME / USERPROFILE to a temp dir.
async function withFakeHome<T>(fn: (home: string) => Promise<T>): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), 'deckmark-home-'));
  const origHome = process.env.HOME;
  const origUserProfile = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  try {
    return await fn(home);
  } finally {
    process.env.HOME = origHome;
    process.env.USERPROFILE = origUserProfile;
    await rm(home, { recursive: true, force: true });
  }
}

async function exists(p: string): Promise<boolean> {
  try { await stat(p); return true; } catch { return false; }
}

test('install + uninstall round-trip writes and removes all artifacts', async () => {
  // Re-import after env mutation so os.homedir() sees the new HOME.
  // Node caches homedir() result, so import inside the closure.
  await withFakeHome(async (home) => {
    const { install } = await import('../../cli/install.ts');
    const { uninstall } = await import('../../cli/uninstall.ts');

    await install({ scope: 'global', force: false });

    const cfgPath = join(home, '.claude.json');
    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    assert.deepEqual(cfg.mcpServers.deckmark, {
      command: 'npx',
      args: ['-y', 'deckmark-mcp']
    });

    assert.ok(await exists(join(home, '.claude', 'skills', 'deckmark', 'SKILL.md')));
    assert.ok(await exists(join(home, '.claude', 'commands', 'use-deckmark.md')));

    await uninstall({ scope: 'global', force: false });

    const cfgAfter = JSON.parse(await readFile(cfgPath, 'utf8'));
    assert.equal(cfgAfter.mcpServers.deckmark, undefined);
    assert.equal(await exists(join(home, '.claude', 'skills', 'deckmark')), false);
    assert.equal(await exists(join(home, '.claude', 'commands', 'use-deckmark.md')), false);
  });
});

test('install refuses to overwrite different MCP entry without --force', async () => {
  await withFakeHome(async (home) => {
    const cfgPath = join(home, '.claude.json');
    await writeFile(
      cfgPath,
      JSON.stringify({
        mcpServers: { deckmark: { command: 'something-else' } }
      })
    );

    const { install } = await import('../../cli/install.ts');
    await assert.rejects(() => install({ scope: 'global', force: false }), /already set/);
  });
});

test('install --force overwrites different MCP entry', async () => {
  await withFakeHome(async (home) => {
    const cfgPath = join(home, '.claude.json');
    await writeFile(
      cfgPath,
      JSON.stringify({ mcpServers: { deckmark: { command: 'something-else' } } })
    );

    const { install } = await import('../../cli/install.ts');
    await install({ scope: 'global', force: true });

    const cfg = JSON.parse(await readFile(cfgPath, 'utf8'));
    assert.deepEqual(cfg.mcpServers.deckmark, {
      command: 'npx',
      args: ['-y', 'deckmark-mcp']
    });
  });
});

test('install is idempotent when entry already matches', async () => {
  await withFakeHome(async (home) => {
    const { install } = await import('../../cli/install.ts');
    await install({ scope: 'global', force: false });
    // Second call should not throw and should leave files in place.
    await install({ scope: 'global', force: true });
    const cfg = JSON.parse(await readFile(join(home, '.claude.json'), 'utf8'));
    assert.deepEqual(cfg.mcpServers.deckmark, {
      command: 'npx',
      args: ['-y', 'deckmark-mcp']
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `node --import tsx --test test/integration/cli-install.test.ts`
Expected: PASS — 4/4 tests. (Note: `os.homedir()` reads `$HOME`/`$USERPROFILE` lazily on each call, so the env override works.)

- [ ] **Step 3: If a test fails because `os.homedir()` is cached**

If `os.homedir()` returns a stale value, you'll see writes go to the real home. Fix by calling `homedir()` inside the path-resolution functions rather than at module load. The current `paths.ts` does this correctly (`homedir()` is called per-invocation, not at module top-level).

- [ ] **Step 4: Commit**

```bash
git add test/integration/cli-install.test.ts
git commit -m "test(cli): end-to-end install/uninstall round-trip"
```

---

## Task 10: package.json — add `deckmark` bin and confirm files glob

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the bin entry**

Edit `package.json`. Change:

```json
"bin": {
  "deckmark-mcp": "dist/mcp/server.js"
},
```

to:

```json
"bin": {
  "deckmark-mcp": "dist/mcp/server.js",
  "deckmark": "dist/cli/index.js"
},
```

- [ ] **Step 2: Confirm `dist/cli/` is included by the existing `files` glob**

The `files` array already lists `"dist/"`, which covers `dist/cli/`. No change needed. Verify by running:

Run: `npm run build`
Then: `ls dist/cli/`
Expected: `argv.js  config.js  copy.js  index.js  install.js  paths.js  types.js  uninstall.js` (some may have `.js.map` siblings — that's fine).

- [ ] **Step 3: Verify packed contents include the CLI**

Run: `npm pack --dry-run 2>&1 | grep "dist/cli"`
Expected: Lines listing `dist/cli/index.js` and the other CLI files.

- [ ] **Step 4: Verify the bin works after build**

Run: `node dist/cli/index.js --help`
Expected: Prints the `USAGE` block.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: All existing tests still pass, plus the 4 new unit suites and 1 integration suite.

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "feat(packaging): expose deckmark CLI bin"
```

---

## Task 11: README.md — promote new install path, demote marketplace

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the existing README to find the Install section**

Run: `node -e "console.log(require('fs').readFileSync('README.md', 'utf8'))" | grep -n -i "install\|marketplace"`
Note the line ranges for the current install instructions.

- [ ] **Step 2: Replace the install section**

Replace whatever currently introduces installation with this content (preserve surrounding sections — Features, Usage, etc. — untouched):

```markdown
## Install

```sh
npx -y deckmark install
```

That's it. Open Claude Code in any project and type `/use-deckmark`.

Install into the current project only (instead of your user home):

```sh
npx -y deckmark install --project
```

### Uninstall

```sh
npx -y deckmark uninstall          # or --project
```

<details>
<summary>Install via Claude Code marketplace (legacy)</summary>

If you prefer the Claude Code plugin marketplace:

```text
/plugin marketplace add github:sowenzhang/deckmark
/plugin install deckmark@deckmark-marketplace
```

This path remains supported for users who already have it set up.
</details>
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: promote npx install, move marketplace to legacy section"
```

---

## Task 12: release.yml — publish to npm on tag

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add the publish step before the GitHub Release step**

Edit `.github/workflows/release.yml`. Locate the `Pack` step. Insert a new step *between* `Pack` and `Create / update GitHub Release with tarball asset`:

```yaml
      - name: Publish to npm
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: npm publish --access public
```

Also add an npm registry config to the `Setup Node 22` step so `npm publish` authenticates correctly. Change:

```yaml
      - name: Setup Node 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
```

to:

```yaml
      - name: Setup Node 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          registry-url: 'https://registry.npmjs.org'
```

- [ ] **Step 2: Document the NPM_TOKEN secret requirement**

Add a one-line comment at the top of the `release` job:

```yaml
  release:
    # Requires repo secret NPM_TOKEN (npm "Automation" token with publish scope).
    runs-on: ubuntu-latest
```

- [ ] **Step 3: Confirm a dry-run still passes locally**

Run: `npm pack --dry-run`
Expected: Lists files, no errors.

(We do not run `npm publish` locally — the first real publish happens when you push the next `v*` tag, after creating the `NPM_TOKEN` secret in the GitHub repo settings.)

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: publish to npm on tag release"
```

---

## Task 13: Final verification

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: All tests pass — existing tests plus 4 new unit suites (paths, config, copy, argv) and 1 new integration suite (cli-install).

- [ ] **Step 2: Manual end-to-end on a clean directory**

In a fresh PowerShell window:

```powershell
# Use a temp HOME so the test does not touch the real ~/.claude.json
$env:HOME = "$env:TEMP\deckmark-smoke-$([guid]::NewGuid())"
$env:USERPROFILE = $env:HOME
New-Item -ItemType Directory -Force $env:HOME | Out-Null

# Build and run the CLI as if installed
npm run build
node dist/cli/index.js install
Get-Content "$env:HOME\.claude.json"
Get-ChildItem "$env:HOME\.claude\skills"
Get-ChildItem "$env:HOME\.claude\commands"

node dist/cli/index.js uninstall
Get-Content "$env:HOME\.claude.json"

Remove-Item -Recurse -Force $env:HOME
```

Expected: After install, `.claude.json` has `mcpServers.deckmark`; skill and command files exist. After uninstall, `mcpServers` is empty (or `deckmark` key is gone) and the files are removed.

- [ ] **Step 3: Push the branch and open PR**

```bash
git push -u origin feat/standalone-installer
gh pr create --title "feat: standalone npx deckmark install" --body "$(cat <<'EOF'
## Summary
- New `deckmark` CLI bin with `install` / `uninstall` subcommands
- Users can now register the MCP server, skill, and slash command via `npx -y deckmark install` instead of going through the marketplace
- Marketplace path preserved as a legacy install option in the README
- Release workflow extended to `npm publish --access public` on tag

Design: `docs/specs/2026-05-27-standalone-installer-design.md`
Plan: `docs/plans/2026-05-27-standalone-installer.md`

## Test plan
- [x] `npm test` — all unit + integration tests pass
- [x] Manual: `node dist/cli/index.js install` against a temp HOME writes config + files; `uninstall` removes them
- [ ] After merge + tag, confirm `npm publish` step succeeds and `npx -y deckmark@<version> install` works on a clean machine
EOF
)"
```

- [ ] **Step 4: Before tagging the next release, add the `NPM_TOKEN` secret in the GitHub repo settings**

This is the only out-of-band step. Once added, push a `v1.1.0` (or whatever the new version is) tag and the release workflow will publish to npm automatically.

---

## Notes for the implementer

- The package uses `"type": "module"` and `allowImportingTsExtensions: true`. Import paths must end with `.ts` in source. The TypeScript compiler rewrites `.ts` → `.js` at emit time (see `rewriteRelativeImportExtensions` in `tsconfig.json`).
- All new code is pure ES modules — no `require()`.
- Tests use `node:test` and `node:assert` (strict). They run via `node --import tsx --test <files>`.
- The `paths.ts` module deliberately calls `os.homedir()` *inside* each exported function, not at module top-level. This is what makes the integration test's `$HOME` override work.
- The CLI has no external runtime dependencies. It uses only `node:fs`, `node:path`, `node:os`, `node:url`, `node:crypto`.
- If you need to add a CLI flag later (`--verbose`, `--dry-run`, etc.), extend `cli/argv.ts` and the `Options` type in `cli/types.ts`. Everything downstream picks it up via the typed `Options` object.

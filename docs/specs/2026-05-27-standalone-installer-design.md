# Standalone `npx deckmark install` — Design

**Date:** 2026-05-27
**Branch:** `feat/standalone-installer`
**Status:** Approved by sowenzhang, ready for implementation plan

## Goal

Replace the two-step Claude Code marketplace install (`/plugin marketplace add` + `/plugin install`) with a single command users can run from anywhere:

```
npx -y deckmark install
```

Keep the MCP server, the `use-deckmark` skill, and the `/use-deckmark` slash command. Reduce install friction to one command and eliminate the per-distribution-channel marketplace metadata as the primary install path.

## Non-goals

- Removing `.claude-plugin/` or `marketplace.json` from the repo. They remain as a secondary install option for users who prefer marketplaces; the README simply stops promoting them.
- An `upgrade` subcommand. `npx -y deckmark-mcp` always fetches the latest MCP, and the skill markdown is small enough that re-running `install` covers updates.
- A `status` subcommand. Easy to add later if real users ask.
- Multi-user / system-wide install (e.g., `/usr/local`). "Global" means the current user's home only.

## Background

The plugin is already npm-publishable. `package.json` has `bin: { "deckmark-mcp": "dist/mcp/server.js" }` and a `prepack` build. The current `.mcp.json` registers the MCP via `npx -y --package <github-release-tarball-url> deckmark-mcp`, which works but is slow on first run and pinned to GitHub release naming.

The package name `deckmark` is unclaimed on npm (verified via `npm view deckmark` returning 404). The existing release-on-tag pipeline produces a tarball; extending it to also `npm publish` is a small step.

## Decisions

Three forks were resolved during brainstorming (2026-05-27):

| Fork | Choice |
|------|--------|
| Install scope | Global by default; `--project` flag for project-local install |
| MCP delivery | Publish to npm; `mcpServers.deckmark` uses `npx -y deckmark-mcp` |
| Marketplace path | Keep `.claude-plugin/` as secondary, stop promoting in README |

## User-facing surface

### Global install (default)

```
$ npx -y deckmark install
✓ MCP registered in ~/.claude.json
✓ skill installed to ~/.claude/skills/deckmark/
✓ slash command installed to ~/.claude/commands/use-deckmark.md
Done. Start a Claude Code session and type /use-deckmark.
```

### Project-scoped install

```
$ cd my-project
$ npx -y deckmark install --project
✓ MCP registered in ./.mcp.json
✓ skill installed to ./.claude/skills/deckmark/
✓ slash command installed to ./.claude/commands/use-deckmark.md
```

### Uninstall

```
$ npx -y deckmark uninstall [--project] [--force]
✓ removed mcpServers.deckmark from <config>
✓ removed skill at <path>
✓ removed slash command at <path>
```

Without `--force`, uninstall refuses to delete files whose contents differ from the installed version (the user may have edited them).

### Flags

- `--project` — write to the current directory instead of `$HOME`.
- `--force` — overwrite existing skill/command files on install; bypass modification check on uninstall.

## Architecture

A new CLI is added alongside the existing MCP server. They share nothing except the npm package.

```
package.json
  bin:
    deckmark-mcp  → dist/mcp/server.js     (existing, unchanged)
    deckmark      → dist/cli/index.js      (new)

cli/                                       (new top-level dir, matches mcp/ and runtime/ convention; compiled into dist/cli/)
  index.ts        — argv parsing, command dispatch
  install.ts      — install subcommand
  uninstall.ts    — uninstall subcommand
  paths.ts        — resolve target paths (global vs project)
  config.ts       — atomic read/patch/write for ~/.claude.json or .mcp.json
  copy.ts         — copy skill folder + command file, with idempotency checks

tsconfig.json                              (modified)
  include: add "cli/**/*.ts"
```

### Command dispatch (`index.ts`)

Parse `process.argv` for one of `install | uninstall | --help | --version`. Read `--project` and `--force` flags. No CLI framework dependency — two subcommands and two flags do not justify one. Print usage and exit non-zero on unknown args.

### `install.ts` — three steps in order

1. **Register MCP.** Read the target config file (`~/.claude.json` or `./.mcp.json`). If it does not exist, start from `{}`. If it exists but is invalid JSON, fail loudly without touching it. Set `mcpServers.deckmark = { command: "npx", args: ["-y", "deckmark-mcp"] }`. If an entry for `deckmark` already exists with the same shape, no-op. If it exists with a different shape, warn and overwrite only with `--force`.

2. **Copy skill.** Recursively copy `skills/deckmark/` from the package into `~/.claude/skills/deckmark/` (or `./.claude/skills/deckmark/`). The folder name matches the skill's `name:` frontmatter. If the destination exists, refuse unless `--force`.

3. **Copy slash command.** Copy `commands/use-deckmark.md` into `~/.claude/commands/use-deckmark.md` (or `./.claude/commands/use-deckmark.md`). Same overwrite rule.

Each step prints a `✓` line on success. Any failure aborts and rolls back: the config write uses temp-then-rename so the original is intact; copied files are tracked and removed in a `try/finally`.

### `uninstall.ts`

Reverse of install. For each file, before deletion: compare its content hash to the version shipped in the current package. If they differ, refuse unless `--force` is passed. Remove the `mcpServers.deckmark` entry from the config; if `mcpServers` becomes empty, leave it as `{}` rather than deleting the key.

### `paths.ts`

```ts
homeBase()    → os.homedir()
projectBase() → process.cwd()

configPath(scope)  → scope === "project" ? "./.mcp.json"  : path.join(homeBase(), ".claude.json")
skillsDir(scope)   → scope === "project" ? "./.claude/skills"   : path.join(homeBase(), ".claude/skills")
commandsDir(scope) → scope === "project" ? "./.claude/commands" : path.join(homeBase(), ".claude/commands")
```

Windows handling: `os.homedir()` resolves to `$USERPROFILE` on Windows. No extra branching needed.

### `config.ts` — atomic config patching

```ts
readConfig(path)      → JSON.parse(fs.readFileSync(path, "utf8"))  // empty {} if missing
writeConfigAtomic(path, obj):
  tmp = path + ".tmp-" + process.pid
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n")
  fs.renameSync(tmp, path)
```

This avoids corrupting `~/.claude.json` if the process is killed mid-write.

### `copy.ts`

Wraps `fs.cp(src, dest, { recursive: true, errorOnExist: !force })` for the skill folder and `fs.copyFileSync` for the slash command. Returns the list of files written so the caller can roll back on later failure.

## npm publishing

Extend `.github/workflows/release.yml` (the existing release-on-tag workflow) with an `npm publish --access public` step gated on a `NPM_TOKEN` repo secret. First publish is `1.0.0` (matching current `package.json`).

Confirm `package.json.files` includes `dist/cli/`. Current `files` array lists `dist/`, which already covers it — verify after first `npm run build` that `dist/cli/` is produced.

## Edge cases

| Case | Behavior |
|------|----------|
| `~/.claude.json` missing | Create with `{ "mcpServers": { "deckmark": {...} } }` |
| `~/.claude.json` invalid JSON | Print parse error and the offending path; exit non-zero; do not touch the file |
| `mcpServers.deckmark` already present, same shape | No-op, print "already registered" |
| `mcpServers.deckmark` present, different shape | Refuse to overwrite without `--force`; print diff hint |
| Skill / command file exists at target | Refuse without `--force` |
| Mid-install failure (e.g., disk full on step 3) | Roll back config (temp file never renamed) and copied files (removed in `finally`) |
| Uninstall of file the user edited | Refuse without `--force`; print path so user can save changes |
| User runs `install --project` in non-git, non-project directory | Still works — only checks `cwd()`, no project detection |

## README changes (in this branch)

- Top-level "Install" section is replaced with a single `npx -y deckmark install` block plus the `--project` variant.
- Old marketplace instructions move into a collapsed `<details><summary>Install via Claude Code marketplace (legacy)</summary>` block at the bottom of the Install section.
- Add a one-line "Uninstall" section after Install.

## Open questions

None at spec time.

## Implementation order (preview, full plan in next step)

1. Scaffold `cli/` with the six files above as stubs; add `cli/**/*.ts` to `tsconfig.json` `include`.
2. Implement `paths.ts` + `config.ts` (pure functions, unit-testable).
3. Implement `install.ts` + `copy.ts`.
4. Implement `uninstall.ts`.
5. Wire `bin: { deckmark }` into `package.json`, update `build:src` script if needed.
6. Update README.
7. Extend release pipeline with `npm publish` step.
8. Test end-to-end on a clean machine (or VM) — fresh install, re-install, uninstall, `--project` install.

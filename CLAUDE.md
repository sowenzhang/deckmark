# CLAUDE.md

Working notes for an AI agent (Claude / Codex / Gemini / Copilot) picking
this repo up cold. README.md is for users installing the plugin; this
file is for you contributing to it.

## What this project is

deckmark is an MCP-first plugin: an AI agent that lets users build a
slide deck, opens it in the browser with an annotation overlay, the user
clicks elements to leave comments, and the agent reads those annotations
back and applies them. AI-agnostic (Claude Code, Gemini CLI, Codex,
Copilot, Cursor) because the surface is the MCP tool list, not a CLI.

## Architecture map

| Path | Role |
|---|---|
| `mcp/server.ts` | MCP stdio server entry. Exposes the eight tools. |
| `mcp/tools/` | One file per tool: `init`, `build`, `review`, `annotations`, `publish`. |
| `runtime/engines/reveal.ts` | Markdown → reveal.js HTML. Owns `build_deck`, user-asset sync, the `.deckmark-build` marker. |
| `runtime/server/` | Fastify review server: static file routes, overlay injection, session API. |
| `runtime/overlay/` | Browser-side overlay (TS, bundled by esbuild to `dist/overlay/overlay.js`). |
| `runtime/publish/inline-html.ts` | Single-file publish: inlines reveal CSS/JS + base64 images. |
| `runtime/publish/multi-file.ts` | Multi-file publish: copies buildDir + overlays reveal dist. |
| `runtime/store/` | Annotation session JSON store and build hashing. |
| `runtime/quality/` | Deck brief, deterministic analysis, beauty/audience rubric, and persisted quality verdicts. |
| `skills/deckmark/SKILL.md` | Agent-facing prompt explaining the workflow. |
| `commands/` | Claude-Code slash commands (e.g. `/deckmark:use-deckmark`). |
| `test/unit/`, `test/integration/` | `node:test`-based suites. |

reveal.js is **vendored at runtime via `require.resolve('reveal.js/dist/reveal.js')`**, not hard-coded. This is load-bearing: when deckmark is installed via npx, reveal.js gets hoisted to a parent `node_modules/`, so any hard-coded path would break.

## Build / test / run

```
npm run build         # build:src + typecheck:overlay + build:overlay
npm run build:src     # tsc + copy templates/themes — fastest for MCP/engine changes
npm run build:overlay # esbuild bundle for the browser overlay only
npm test              # unit + integration; must be green before commit
npm run mcp           # spawn the MCP server locally for manual testing
```

There's no watch mode. After each change, rebuild + restart whichever
agent is hosting the MCP server.

## Distribution

- Released via **GitHub Releases**, not npm. The release workflow on
  `tags: ['v*']` packs `deckmark.tgz` and uploads it.
- Marketplace + non-Claude agents fetch it via
  `npx -y --package https://github.com/sowenzhang/deckmark/releases/latest/download/deckmark.tgz deckmark-mcp`.
- Three files carry the version and must move together:
  `package.json`, `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`.
  The CI workflow refuses to release if they disagree with the tag.
- `npx` keys its cache by URL. Re-releasing the same version with new
  bytes does NOT invalidate it. See `docs/troubleshooting.md` for the
  cache-wipe procedure.

## Conventions

- **No emojis** anywhere unless the user explicitly asks. Same for the
  docs the agent writes.
- **No new doc files unless asked.** ROADMAP, README, troubleshooting
  already exist; resist adding more.
- **Comments**: default to none. Only write one when *why* is
  non-obvious (a hidden constraint, a workaround for a specific bug,
  surprising behavior). Don't restate what the code does.
- **Tests**: TDD friendly. Every security-relevant fix in v1.0 ships
  with a regression test (see `test/unit/engines-reveal.test.ts` for
  the symlink, traversal, and marker-guard tests as a pattern).
- **Security defaults**: anything that resolves a path from user input
  goes through a containment check (`isUnder(root, candidate)` in
  `inline-html.ts`). Anything that copies user files rejects symlinks
  via the `cp({ filter })` pattern.
- **Destructive ops** (`rm`, force-push, etc.): always guarded. The
  `.deckmark-build` marker-file ratchet in `runtime/engines/reveal.ts`
  is the canonical example — copy that pattern.
- **Paths in docs**: never hard-code absolute paths like
  `C:\projects\...`. Use placeholders or env-var-based
  discovery (`$env:USERPROFILE`, `$LOCALAPPDATA`, etc.).

## Where to look first

- A new user task → `README.md`.
- A new release → `docs/troubleshooting.md` § "Release-time issues".
- A reported bug → `docs/troubleshooting.md` matches symptoms to fixes.
- Long-term direction → `docs/ROADMAP.md`.
- Agent workflow when running the eight tools → `skills/deckmark/SKILL.md`.

## What NOT to do

- Don't `npm publish`. The plugin is shipped via GitHub Releases only.
- Don't add a CLI surface. The MCP tool list is the public API.
- Don't change emitted HTML paths back to absolute (`/vendor/reveal/...`).
  Relative paths (`vendor/reveal/...`) are load-bearing for the
  multi-file publish to work via plain `file://` double-click.
- Don't introduce telemetry, accounts, or hosted state. The plugin is
  local-first by design (see "Not planned" in `docs/ROADMAP.md`).
- Don't skip the regression test when patching a security finding. The
  v1.0 review cycle added one test per fix; keep that ratio.

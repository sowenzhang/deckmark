# Troubleshooting

Symptoms and fixes for the install / release / local-dev issues we've hit.
Every command is real — copy-paste should work.

Path conventions used below:
- Windows npx cache: `%LOCALAPPDATA%\npm-cache\_npx\`
- macOS / Linux npx cache: `~/.npm/_npx/`
- Claude Code plugin home: `~/.claude/plugins/`

---

## Health check — is the install actually working?

Run these three checks in order. If all three pass, the install is fine.

1. **MCP server connected**. In Claude Code, type `/mcp`. `deckmark` must
   show as **connected**. If it says "disconnected" or doesn't appear,
   jump to "MCP server doesn't load" below.
2. **Tools listed**. The tool list (visible during a tool call, or
   ask the agent "list your MCP tools") must include the seven
   `mcp__deckmark__*` entries: `init_deck`, `build_deck`, `start_review`,
   `wait_for_close`, `get_annotations`, `stop_review`, `publish_deck`.
3. **Trivial build works**. In any directory, ask the agent:
   *"use deckmark to create a one-slide deck about anything"*. If
   `build_deck` and `start_review` complete and a browser opens, you're
   good.

---

## A new release isn't being picked up

**Symptom**: you tagged a new release (or re-tagged v1.0.0), but the
installed plugin still runs old code.

**Cause**: two layers of cache, both URL-keyed.

1. Claude Code's marketplace mirror at
   `~/.claude/plugins/cache/deckmark-marketplace/` is the marketplace
   manifest cache. It's refreshed by `/plugin marketplace update`.
2. `npx`'s cache at `%LOCALAPPDATA%\npm-cache\_npx\<hash>\node_modules\deckmark\`
   is keyed by the URL, **not** the tarball contents. Re-uploading the
   same tarball URL with new bytes does not invalidate it.

**Fix**:

```powershell
# 1. Refresh the marketplace mirror (the slash command runs inside Claude Code)
/plugin marketplace update deckmark-marketplace

# 2. Wipe the npx cache entirely
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"

# 3. Restart Claude Code so the MCP server re-spawns and re-fetches the tarball
```

On macOS / Linux step 2 becomes `rm -rf ~/.npm/_npx`.

To verify the new code actually landed before restarting, inspect the
extracted package:

```powershell
# Find the npx bucket containing deckmark
Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx" -Directory |
  Where-Object { Test-Path "$($_.FullName)\node_modules\deckmark" } |
  Select-Object -ExpandProperty FullName
```

Grep that path's `dist/runtime/engines/reveal.js` for any identifier
unique to your new code (e.g. `rejectSymlink`, `deckmark-build`,
`REVEAL_PREFIX = 'vendor/reveal'`).

---

## MCP server doesn't load (`/mcp` shows it disconnected, or it's missing)

**Symptom**: `/mcp` lists deckmark as disconnected, or you see
`-32000 Failed to reconnect to plugin:deckmark:deckmark` in the agent
output.

This is a catch-all — there are five known causes, in rough order of
likelihood. Work the list top-to-bottom.

1. **Stale npx cache**. See the section above. This was the most common
   cause during v1.0 development.
2. **Stale marketplace mirror**. `/plugin marketplace update deckmark-marketplace`,
   then restart Claude Code.
3. **Plugin not enabled in the plugin manager**. Open `/plugin`, find
   `deckmark@deckmark-marketplace`, confirm it's enabled (not just
   installed). Toggle off → on if uncertain.
4. **Malformed `.mcp.json` inside the plugin**. The plugin's `.mcp.json`
   must be a flat shape with each server at the top level — *not*
   wrapped in `{ "mcpServers": {...} }`. Example of correct shape:
   ```json
   {
     "deckmark": {
       "command": "npx",
       "args": ["-y", "--package",
         "https://github.com/sowenzhang/deckmark/releases/latest/download/deckmark.tgz",
         "deckmark-mcp"]
     }
   }
   ```
   If you forked the plugin and wrapped it in `mcpServers`, Claude Code
   silently skips it.
5. **Relative `dist/mcp/server.js` path**. If the plugin's `.mcp.json`
   references a path inside the plugin install directory, it must use
   `${CLAUDE_PLUGIN_ROOT}` — not a relative path. (The released plugin
   uses `npx` and avoids this entirely; only relevant if you're forking
   or hand-rolling a local plugin.)

If all five check out and it's *still* broken, nuke it all:

```powershell
# Nuclear option — uninstall everything and start fresh
/plugin uninstall deckmark
/plugin marketplace remove deckmark-marketplace
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\plugins\cache\deckmark-marketplace"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"
# Restart Claude Code, then reinstall:
/plugin marketplace add sowenzhang/deckmark
/plugin install deckmark@deckmark-marketplace
```

---

## Build / runtime errors

### `Reveal is not defined` + 404s on `/vendor/reveal/*`

**Cause**: reveal.js wasn't found on disk. The release uses
`require.resolve('reveal.js/dist/reveal.js')` so it works whether reveal
is hoisted (npx-extracted tarball) or nested (local `node_modules`).
If you forked and hard-coded a path like `<PKG_ROOT>/node_modules/reveal.js/dist`,
npx's hoisting will break it.

**Fix**: use `require.resolve`, never a hard-coded path. See
`runtime/server/static-overlay.ts` and `runtime/publish/multi-file.ts`
for the pattern.

### Images 404 from the review server

**Cause** (pre-v1.0): the engine didn't sync user assets from the deck
folder into `build/`. The dev server only serves from `build/`.

**Fix**: this is handled in v1.0+. If you see it post-v1.0, you're on a
stale install — wipe the npx cache and restart.

### Published `index.html` opens blank when double-clicked

**Cause**: the HTML references reveal.js using absolute paths like
`/vendor/reveal/reveal.js`. Under `file://`, that resolves to the
filesystem drive root (`file:///vendor/reveal/reveal.js`), not the
folder containing `index.html`.

**Fix**: v1.0+ emits relative paths (`vendor/reveal/reveal.js`). If you
have an older published folder, either republish (after upgrading) or
manually edit `index.html` and remove the leading `/` from **all
three** references (two `<link>` tags + one `<script>` tag). Partial
edits leave the page blank because reveal.css still fails to load.

### `TypeError: (0, import_unique_selector.default) is not a function`

**Cause**: esbuild's CJS interop wraps `module.exports = fn` as
`{ default: fn }`. If your code does `import getSelector from 'unique-selector'`,
the bundled output reads `.default` which doesn't exist on the original
function export.

**Fix**: import then unwrap defensively. Pattern in `runtime/overlay/selector.ts`:
```typescript
import _uniqueSelector from 'unique-selector';
const uniqueSelector = (_uniqueSelector as any).default ?? _uniqueSelector;
```

### `TypeError: funcs[next] is not a function`

**Cause**: passed an invalid selector-type to `unique-selector`. The
valid set is `'NthChild' | 'ID' | 'Class' | 'Tag' | 'Attributes'` —
**not** `'data-*'`.

**Fix**: use `'Attributes'` and filter on the data attribute later.

---

## Local development — testing your own changes

You can't simply rebuild the source repo and expect the released plugin
to pick it up — the released plugin runs from the npx cache, not your
source tree. There are two clean paths.

### Path A: bypass the plugin system entirely (recommended)

1. **Uninstall the released plugin** so it doesn't shadow your local
   tools:
   ```
   /plugin uninstall deckmark
   /plugin marketplace remove deckmark-marketplace
   Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\plugins\cache\deckmark-marketplace"
   ```
2. **Build your local source**:
   ```powershell
   cd <path-to-deckmark-clone>
   npm run build
   ```
3. **Add a project-level MCP entry** at the repo where you want to test.
   Drop this in `.mcp.json` at that repo's root, substituting the
   absolute path to your local clone (forward slashes are also accepted
   in JSON strings, which avoids the `\\` escaping on Windows):
   ```json
   {
     "deckmark-local": {
       "command": "node",
       "args": ["<absolute-path-to-deckmark-clone>/dist/mcp/server.js"]
     }
   }
   ```
   Tools will appear as `mcp__deckmark-local__*` (note the suffix), which
   is fine for testing.
4. **Restart Claude Code** so it picks up the new MCP entry.
5. **After each change**, run `npm run build` (or just `npm run build:src`
   if you didn't touch the overlay) and restart Claude Code. There's
   no watch mode today — MCP servers are spawned once per session.

### Path B: in-place replace the installed plugin

Faster iteration loop, but more fragile. After `npm run build`, copy
`dist/`, `package.json`, and `.mcp.json` into the installed plugin path:

```powershell
# Set $src to your local clone of the deckmark repo, then discover the
# installed plugin's versioned folder so this snippet keeps working as
# the plugin version changes.
$src = "<absolute-path-to-deckmark-clone>"
$dst = Get-ChildItem "$env:USERPROFILE\.claude\plugins\cache\deckmark-marketplace\deckmark" -Directory |
       Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty FullName

Copy-Item -Recurse -Force "$src\dist" "$dst\dist"
Copy-Item -Force "$src\package.json" "$dst\package.json"
Copy-Item -Force "$src\.mcp.json" "$dst\.mcp.json"
```

Restart Claude Code after each copy. Path B breaks if the plugin
manager re-syncs from the marketplace mirror — happens on Claude Code
update.

### Going back to the released version

After local dev, restore the released install:

```
/plugin marketplace add sowenzhang/deckmark
/plugin install deckmark@deckmark-marketplace
```

If you used Path A, also remove the `deckmark-local` entry from any
project's `.mcp.json` so tool names don't collide.

---

## Release-time issues

### Tag push didn't fire CI

**Cause**: the workflow triggers on `push: tags: ['v*']`. If you tagged
locally but pushed only the branch (not the tag), CI doesn't fire.
`git push origin v1.0.0` is required separately from `git push origin main`.

### `Git tag 'vX' does not match package.json version 'vY'`

**Cause**: the release workflow's first step cross-checks the tag
against `package.json#version`. If they don't match, CI fails before
building.

**Fix**: bump three files in sync — `package.json`,
`.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` — then
re-tag.

### Re-releasing the same version

If you must replace v1.0.0 with the same version number (e.g., fixing
a packaging bug shortly after release):

1. Delete the GitHub Release in the browser (trash icon at the top of
   the release page).
2. Delete the tag remotely: `git push origin :refs/tags/v1.0.0`.
3. Delete the tag locally: `git tag -d v1.0.0`.
4. Re-tag at the new HEAD: `git tag v1.0.0`.
5. Push: `git push origin v1.0.0`.

Note: anyone who already cached v1.0.0 will silently get a different
tarball on their next cache miss. Prefer bumping to v1.0.1 unless the
window is very short.

---

## Full reset (when nothing else works)

Wipes every cache, every install, every artifact. Start over from a
clean slate:

```powershell
# 1. Uninstall and remove the marketplace inside Claude Code
/plugin uninstall deckmark
/plugin marketplace remove deckmark-marketplace

# 2. Nuke the on-disk caches
Remove-Item -Recurse -Force "$env:USERPROFILE\.claude\plugins\cache\deckmark-marketplace"
Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"

# 3. Remove the entry from installed_plugins.json if it's still there
#    Open ~/.claude/plugins/installed_plugins.json and delete the
#    "deckmark@deckmark-marketplace" key if present.

# 4. Restart Claude Code

# 5. Reinstall
/plugin marketplace add sowenzhang/deckmark
/plugin install deckmark@deckmark-marketplace

# 6. Restart Claude Code one more time so the MCP server spawns
```

If step 6 still leaves the MCP disconnected, capture the contents of
`%LOCALAPPDATA%\npm-cache\_logs\` and open an issue — that's our
debugging trail.

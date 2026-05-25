# deckmark

In-browser annotation for AI-generated presentations. Close the feedback loop without screenshots — works with any AI coding agent that speaks MCP.

You install deckmark once into your agent. Then you type `/deckmark:use-deckmark <topic>` and the agent asks about **mode**, **style**, and **motion**, builds a slide deck, opens it in your browser with an annotation overlay, you click directly on elements to leave change requests, and when you come back to the agent it reads those annotations and applies them. No screenshots, no copy-paste, no terminal–browser ping-pong.

---

## Install

### Claude Code

```
/plugin marketplace add sowenzhang/deckmark
/plugin install deckmark@deckmark-marketplace
```

Quit and reopen Claude Code so the MCP server spawns. Verify with `/mcp` — deckmark should show as **connected**. Then `/deckmark:use-deckmark <topic>` is available.

### Other MCP-aware agents (Gemini CLI, Codex, GitHub Copilot CLI, Cursor, …)

deckmark ships an MCP server bundled in a GitHub Release tarball, fetched on demand via `npx`. Add the following to your agent's MCP config (typical paths: `~/.gemini/settings.json`, `~/.codex/config.toml`, `~/.cursor/mcp.json`, etc. — consult your agent's docs for the right file):

```json
{
  "mcpServers": {
    "deckmark": {
      "command": "npx",
      "args": [
        "-y",
        "--package",
        "https://github.com/sowenzhang/deckmark/releases/latest/download/deckmark.tgz",
        "deckmark-mcp"
      ]
    }
  }
}
```

Restart the agent. The seven deckmark MCP tools become callable. (Note: the slash command `/deckmark:use-deckmark` and the design-system skill are Claude Code–specific packaging conventions and won't appear in other agents. The tools themselves work everywhere — just describe your intent in natural language and the agent will call them.)

### Updating to a new release

When a new version ships:

```
/plugin marketplace update deckmark-marketplace
/plugin install deckmark@deckmark-marketplace
```

Restart Claude. The npx invocation always fetches the `latest` release tarball, so a Claude restart is usually enough on its own.

For non-Claude agents, no update step is needed — `latest/download/deckmark.tgz` is a redirect that always points at the newest release. Restart the agent and `npx` will pick up the new tarball automatically.

---

## Usage

After install, in your agent's chat:

```
/deckmark:use-deckmark Build a deck about Q2 results for the engineering org, dark mode, technical style
```

The agent will:

1. Confirm three design choices: **mode** (light/dark), **style** (professional/academic/fashion/technical/fun), and **motion** (slide transitions / fragment reveals / auto-animate, multi-select). Skip what you've already specified.
2. Ask audience and approximate length.
3. Scaffold a project folder, write `content.md` from your brief, build the deck, and launch a local annotation server at `http://127.0.0.1:<port>`.
4. Tell you the URL. You open it. Press `A` to enter annotation mode, click any slide element, type a comment, repeat. Click ✓ Done when finished.
5. After you click Done, the agent reads your structured feedback, edits `content.md`, and rebuilds. (If you return later, you can still say “apply the comments”.)
6. When the deck is final, ask the agent to publish. It'll offer two options: a single self-contained `.html` (good for email/USB/attachment), or a `published/` folder with `index.html` + cacheable assets (good for hosting on GitHub Pages, Netlify, S3, etc.).

---

## How it works

```
user types /deckmark:use-deckmark <topic>
        ↓
agent asks: mode? style? motion? audience? length?
        ↓
agent: init_deck → writes content.md → build_deck
        ↓
agent: start_review → "open <url>, press A to annotate, click Done"
        ↓
user annotates elements in the browser, clicks Done
        ↓
agent: get_annotations → applies each comment to content.md → build_deck
        ↓
agent: "Want another round, or shall I publish?"
        ↓
agent: publish_deck (single-file or multi-file)
```

Annotations live in `./annotations/session-<timestamp>.json` next to your deck. Writes are atomic (temp-file + rename) and serialized per-deck. Each annotation captures the slide index, CSS selector, DOM path, bounding box, element text, the user's comment, and optional overall summary.

### The seven MCP tools

| Tool | Purpose |
|---|---|
| `init_deck` | Scaffold a project (`content.md`, config, agent instructions, `.gitignore`). |
| `build_deck` | Render `content.md` to `./build/index.html` with reveal.js. Accepts `style`/`mode`/`motion`/`slideNumbers` params. |
| `start_review` | Launch the local annotation review server, return URL + session id. |
| `wait_for_close` | Block until the user clicks "Done" in the browser, or until timeout. |
| `get_annotations` | Read annotations from disk (works even if Done wasn't clicked). |
| `stop_review` | Stop the review server explicitly (auto-stops 5 min after Done otherwise). |
| `publish_deck` | Emit the final shareable artifact — single-file `.html` or multi-file `published/` folder. |

### Design system

Three orthogonal axes:

- **Style** — `professional` (Inter sans, indigo accent), `academic` (Fraunces + Source Serif, terra accent), `fashion` (Space Grotesk display, amber accent), `technical` (terminal feel, cyan accent, monospace prominence), `fun` (Outfit, rounded, coral accent).
- **Mode** — `light` or `dark`. Applies to all 5 styles via CSS variables.
- **Motion** — multi-select: `slide-transitions`, `fragment-reveals`, `auto-animate`. Pass `[]` for no motion. Honors `prefers-reduced-motion`.

The agent can also accept free-form descriptions ("Stripe Press feel, dark, smooth motion") and map them to the three axes.

---

## Privacy & trust model

deckmark runs entirely on your machine. The annotation server binds to `127.0.0.1` only, annotations are JSON files in your project folder, and no telemetry is sent anywhere.

**One exception:** the built-in themes load typefaces from Google Fonts (Inter, Fraunces, Source Serif 4, Space Grotesk, JetBrains Mono, IBM Plex Mono, Outfit — all OFL-licensed). When you or someone you've shared the deck with opens it in a browser, that browser fetches CSS and woff2 files from `fonts.googleapis.com` / `fonts.gstatic.com`. Google sees the requesting IP, User-Agent, and (since these are font files) a low-cardinality fingerprint. Every theme also declares a robust local font fallback stack (system-ui / Inter-equivalents) so if you're offline or have Google Fonts blocked, the deck still renders — just with system fonts.

A future minor release will add a `loadFonts: false` build option to skip the `@import` lines entirely.

**Trust model for `content.md`:** the markdown source you feed to `build_deck` is treated as trusted code. `marked` passes raw HTML through unchanged, so anything in `content.md` (including `<script>` tags) ends up in the rendered deck and can call the local server's API. Treat your `content.md` like source code: don't paste in untrusted markdown, and don't review a deck whose `content.md` came from an unknown source.

---

## Architecture

Single Node 22+ package, TypeScript ESM. Three layers:

- `runtime/` — engine (reveal.js adapter), Fastify review server with overlay script injection, atomic session store, sha256 build hash, browser overlay (vanilla TS bundled via esbuild), publish emitters (inline + multi-file), and project templates.
- `mcp/` — stdio MCP server that exposes the seven tools by calling into the runtime modules.
- `commands/`, `skills/`, `.claude-plugin/`, `.mcp.json` — the Claude plugin packaging surface.

The overlay knows nothing about reveal.js. It walks the rendered DOM and generates stable CSS selectors, so engine adapters for Slidev / Impress / Marp can be added later without changing a line of overlay code. reveal.js is vendored via npm (`node_modules/reveal.js/dist/`) — no CDN dependency, works offline.

The MCP server ships as a Node CLI in a GitHub Release tarball. `.mcp.json` invokes it via `npx`, which downloads the tarball (and its dependencies) into its cache on first use and re-uses it from then on. No build step at install time, and nothing is installed into the user’s deck project directory.

---

## Development

For working on deckmark itself (not for using it):

```bash
git clone https://github.com/sowenzhang/deckmark.git
cd deckmark
npm install
npm run build        # tsc + overlay typecheck + esbuild + template/theme copy
npm test             # unit + integration tests
npm run test:unit
npm run test:integration
npm run mcp          # run the MCP server over stdio (for manual debugging)
```

CI runs the same build + test on Ubuntu / macOS / Windows × Node 22 for every push to main and every PR. Releases are produced by tagging `v*` — a GitHub Actions workflow then builds, packs, and publishes the tarball as a release asset.

To cut a release: bump the version in `package.json`, `.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json` (the release workflow has a guard that fails if these drift from the tag), then `git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`.

---

## License

MIT — see [LICENSE](LICENSE).

# deckmark

In-browser annotation for AI-generated presentations. Close the feedback loop without screenshots — works with any AI coding agent that speaks MCP.

You install deckmark once into your agent (Claude Code, Gemini CLI, Codex, GitHub Copilot CLI, others). Then you type `/use-deckmark <topic>` in your agent's chat. The agent asks about theme and style, builds a slide deck, opens it in your browser with an annotation overlay, you click directly on elements to leave change requests, and when you come back to the agent it reads those annotations and applies them. No screenshots, no copy-paste, no terminal–browser ping-pong.

## Quick start (when run from a clone)

```bash
git clone https://github.com/sowenzhang/deckmark.git
cd deckmark
npm install
npm run build

# Smoke check the MCP server starts and reports its tools
npm run mcp
# (sends nothing on stdin; Ctrl-C to exit)
```

## Install paths

| Agent | How |
|---|---|
| **Claude Code** | `/plugin marketplace add sowenzhang/deckmark` then `/plugin install deckmark`. After install, `/use-deckmark <topic>` becomes available. |
| **Gemini CLI** | `gemini extensions install https://github.com/sowenzhang/deckmark` (the extension manifest is shipped in this repo). |
| **Codex CLI** | Register the MCP server via the agent's config — see [Manual install](#manual-install) below. The `AGENTS.md` template inside the plugin describes the workflow. |
| **GitHub Copilot CLI** | Marketplace verbs are still evolving — track [Copilot's plugin docs](https://docs.github.com/en/copilot) for the current install command. Until then, use the manual install path. |
| **Manual (any MCP-aware agent)** | Clone, build, then add the snippet below to your agent's MCP config file. |

### Manual install

After `git clone` + `npm install` + `npm run build`, add to your agent's MCP config (commonly `~/.claude.json`, `~/.codex/config.toml`, `~/.gemini/settings.json`, etc.):

```json
{
  "mcpServers": {
    "deckmark": {
      "command": "node",
      "args": ["/abs/path/to/deckmark/dist/mcp/server.js"]
    }
  }
}
```

The agent will spawn the MCP server on demand and the seven tools become callable.

## The seven MCP tools

| Tool | Purpose |
|---|---|
| `init_deck` | Scaffold a project (`content.md`, config, agent instructions, `.gitignore`). |
| `build_deck` | Render `content.md` to `./build/index.html` using reveal.js. |
| `start_review` | Launch the local Fastify review server, return URL + session id. |
| `wait_for_close` | Block until the user clicks "Done" in the browser, or until timeout. |
| `get_annotations` | Read annotations from disk (works even if Done wasn't clicked). |
| `stop_review` | Stop the review server explicitly (auto-stops 5 min after Done otherwise). |
| `publish_deck` | Emit the final shareable artifact — single-file HTML (default, ~1-2 MB) or multi-file deploy folder. |

## How the workflow runs

```
user types /use-deckmark <topic>
        ↓
agent asks: theme? style? audience? length?
        ↓
agent: init_deck → writes content.md → build_deck
        ↓
agent: start_review → "open <url>, press A to annotate, click Done"
        ↓
user annotates elements in the browser, clicks Done
        ↓
agent: get_annotations → applies each comment to content.md → build_deck
        ↓
agent: "Want another round, or shall I publish a single HTML file?"
        ↓
agent: publish_deck (single-file or multi-file)
```

State lives in `./annotations/session-<timestamp>.json` next to your deck. Writes are atomic (temp-file + rename) and serialized per-deck. Each session captures the slide index, CSS selector, DOM path, bounding box, element text, the user's comment, and optional overall summary.

## Architecture

Single Node 22+ package, TypeScript ESM. Three layers:

- `runtime/` — engine (reveal.js adapter), Fastify review server with overlay script injection, atomic session store, sha256 build hash, browser overlay (vanilla TS bundled via esbuild), publish emitters (inline + multi-file), and project templates.
- `mcp/` — stdio MCP server that exposes the seven tools by calling into the runtime modules.
- `commands/`, `skills/`, `.claude-plugin/`, `.mcp.json` — the plugin packaging surface.

The overlay knows nothing about reveal.js. It walks the rendered DOM and generates stable CSS selectors, so engine adapters for Slidev / Impress / Marp can be added later without changing a line of overlay code. reveal.js is vendored via npm (`node_modules/reveal.js/dist/`) — no jsDelivr dependency, works offline.

## Development

```bash
npm install
npm run build        # tsc + esbuild + template copy
npm test             # unit + integration tests
npm run test:unit
npm run test:integration
npm run mcp          # run the MCP server over stdio (for debugging)
```

## Privacy & trust model

deckmark runs entirely on your machine. The annotation server binds to `127.0.0.1` only, annotations are JSON files in your project folder, and no telemetry is sent anywhere.

**One exception:** the built-in themes load typefaces from Google Fonts (Inter, Fraunces, Source Serif 4, Space Grotesk, JetBrains Mono, IBM Plex Mono, Outfit — all OFL-licensed). When you or someone you've shared the deck with opens it in a browser, that browser fetches CSS and woff2 files from `fonts.googleapis.com` / `fonts.gstatic.com`. Google sees the requesting IP, User-Agent, and (since these are font files) a low-cardinality fingerprint. Every theme also declares a robust local font fallback stack (system-ui / Inter-equivalents) so if the user is offline or has Google Fonts blocked, the deck still renders — just with system fonts.

A future minor release will add a `loadFonts: false` build option to skip the `@import` lines entirely and rely purely on the system fallback chain, plus an opt-in to bundle the woff2 files into the published artifact.

**Trust model for `content.md`:** the markdown source you feed to `build_deck` is treated as trusted code. `marked` passes raw HTML through unchanged, so anything in `content.md` (including `<script>` tags) ends up in the rendered deck and can call the local server's API. Treat your `content.md` like source code: don't paste in untrusted markdown, and don't review a deck whose `content.md` came from an unknown source.

## License

MIT — see [LICENSE](LICENSE).

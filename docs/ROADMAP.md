# Roadmap

This document captures where deckmark is, what's planned, and what's
explicitly out of scope. It's a living doc — open an issue if you want
to push or pull on any item.

## Where we are: v1.0.0 (released)

Shipped and verified end-to-end on Claude Code:

- **Plugin shape**: AI-agnostic MCP server, distributed as a GitHub
  Release tarball, fetched on demand via `npx`. No npm publish required.
- **Seven MCP tools**: `init_deck`, `build_deck`, `start_review`,
  `wait_for_close`, `get_annotations`, `stop_review`, `publish_deck`.
- **Design system**: three orthogonal axes — `style × mode × motion` —
  with 5 styles (`professional`, `academic`, `fashion`, `technical`,
  `fun`), 2 modes (`light`, `dark`), 3 motion flags.
- **Engine**: vendored reveal.js 5.2.0 resolved at runtime via
  `require.resolve`.
- **Overlay**: vanilla TypeScript bundled with esbuild, injected by the
  review server. CSS selectors via `unique-selector`.
- **Review server**: Fastify on `127.0.0.1`, ephemeral port,
  auto-shutdown 5 minutes after Done.
- **Publish**: single-file (everything inlined, ~1–2 MB self-contained
  HTML) and multi-file (folder with `vendor/reveal/` overlay) modes.
- **Security hardening**: symlink rejection at every depth, path
  traversal containment in all four inliner sinks, marker-file ratchet
  on the build-clean, descriptive errors on vendor-path collisions.
- **Tests**: 44 unit + integration tests, green on Node 22.

## Next up (v1.1, near-term)

Small, observable gaps that won't change the public API.

- **MCP `serverInfo.version` is hard-coded `0.1.0`**. Read it from
  `package.json` so the advertise version matches the package version.
  Cosmetic, but it shows in `/mcp` output and looks wrong.
- **Battle-test on non-Claude agents**. The README claims AI-agnostic
  support for Gemini CLI, Codex, Copilot CLI, and Cursor, but only
  Claude Code has been driven end-to-end through a real review loop.
  Verify each install path, fix anything that surfaces.
- **Windows-only CI matrix**. The release workflow only runs Ubuntu /
  Node 22. Windows is the primary dev environment and several recent
  bugs were Windows-specific (path separators, symlink permissions);
  add a Windows job to catch the next one before release.
- **Troubleshooting docs**. Common install failures (stale npx cache,
  marketplace mirror, MCP server didn't load) all have known fixes
  buried in chat history. Lift them into `docs/troubleshooting.md`.
- **Better error surfaces in the agent UI**. When the static server
  can't find an asset, the agent sees a generic 404; emit a structured
  hint in the MCP response so the agent can suggest a fix (e.g.,
  "rebuild — images/ wasn't synced").
- **Stop-clean idempotence**. `stop_review` is already idempotent on
  the server, but the session JSON could leak if the process dies
  between `start_review` and `wait_for_close`. Add a startup sweep
  that prunes orphaned session files older than N minutes.

## Mid-term (v1.x, 3–6 months)

Bigger features, still backward-compatible.

- **Annotation depth**:
  - Threaded comments (reply to a comment without losing the thread).
  - "Resolve with note" so the agent's response shows up in the same
    UI the user wrote the comment in.
  - Batch resolve / batch dismiss from the overlay.
- **Diff view between annotation rounds**. Show the user what changed
  since they last reviewed — visually highlight affected slides so they
  can focus their re-review.
- **Custom themes**. Today the 5 styles are baked in. Let users drop a
  `theme.css` next to `content.md` and reference it from
  `deckmark.config.json`. Keep the 5 built-ins as defaults / starting
  points.
- **More built-in styles**. Likely candidates based on common requests:
  `minimalist` (Swiss / grid-heavy), `editorial` (long-form magazine),
  `pitch` (VC-deck style). Each new style still passes through the
  same three-axis system.
- **Slide templates**. Today every slide is generated from markdown.
  Add named templates (`---template: comparison`, `---template: stat-grid`)
  so the agent can reach for a known shape when the content fits.
- **Speaker-notes annotation**. Notes are second-class today (markdown
  comments below a slide aren't surfaced). Render them in a notes pane
  in presenter mode and let users annotate them too.
- **Export formats**:
  - **PDF**: print-to-PDF via headless Chromium, one slide per page.
  - **PowerPoint**: round-trip to `.pptx` for users whose downstream
    workflow demands it. Higher effort — requires mapping reveal.js
    layouts to PowerPoint shapes; may end up as a separate package.

## Aspirational (v2.0+, year+)

These would be material architecture shifts. Not committed.

- **Multiple engines**. Today reveal.js is the only renderer. A
  pluggable `engine` field in `deckmark.config.json` could pick
  between reveal.js, Marp, or a from-scratch minimal renderer.
- **Real-time collaboration**. Multiple reviewers annotating
  simultaneously, with a presence layer. Needs server-side state, a
  hosted version, or a peer-to-peer overlay.
- **Hosted SaaS**. A managed instance that runs the review server in
  the cloud so reviewers don't need the agent or `npx`. Out of scope
  for the OSS plugin but a natural extension.
- **Video render**. Walking slides through with timed narration —
  outputs an `.mp4`. Requires TTS pipeline + ffmpeg orchestration.
- **Accessibility certification**. Run a WCAG 2.2 AA audit on each of
  the 5 styles; track and fix findings. Already pays attention
  (semantic HTML, keyboard nav for reveal.js), but no formal audit
  yet.
- **Internationalization**. RTL languages, CJK font stacks bundled,
  fallback handling in the overlay UI strings.

## Not planned

Explicitly off the roadmap so users don't ask why these aren't shipping.

- **A WYSIWYG editor**. Markdown source-of-truth is intentional — the
  agent edits it, the user reviews it, both stay coherent. An editor
  would split that loop.
- **Telemetry / analytics**. No opt-in, no opt-out — just none.
  Reviews happen on `127.0.0.1`; nothing leaves the user's machine.
- **An online identity / accounts system**. The plugin is per-user,
  per-machine. No login.
- **Monetization features in the OSS plugin**. Paywalled styles,
  watermarks on free decks, etc. — not happening here.

## How items move on this list

- **Next-up** items are committed; if you don't see them in a release
  within ~3 months, file an issue.
- **Mid-term** items are likely-but-not-guaranteed; ordering depends on
  what real users hit.
- **Aspirational** items live here so they're not lost, but they need
  a champion (in-repo contributor or downstream user with a real use
  case) to graduate.

To advocate for an item: open an issue describing the *use case*
(not the implementation). Use cases shape priority; implementation
sketches are bonus.

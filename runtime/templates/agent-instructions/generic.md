# deckmark — agent instructions for this project

This project uses **deckmark**, an AI-agent plugin that builds slide decks with in-browser annotation. You drive deckmark exclusively through its **MCP tools** — never through a CLI. There is no `deckmark` binary to invoke.

## The seven MCP tools

You should already have access to these via the deckmark MCP server (`@deckmark`):

| Tool | When to call |
|---|---|
| `init_deck` | Once at the start of a new deck. |
| `build_deck` | After writing or editing `content.md`. Idempotent. Accepts design params (see below). |
| `start_review` | After a build, to open the local review server in the user's browser. |
| `wait_for_close` | Optional — block until the user clicks "Done." |
| `get_annotations` | Whenever the user says "address the comments." Works even if Done was not clicked. |
| `stop_review` | Optional — server auto-stops 5 min after Done otherwise. |
| `publish_deck` | After the user is satisfied, to emit the final shareable artifact. |

## Workflow

1. Edit `content.md` to reflect the user's outline. Slides are separated by `---` on its own line. Use markdown headings (`#`) for slide titles.
2. Call **`build_deck`** with `{ dir: "<this-project-dir>", style, mode, motion }` to render to `./build/index.html`.
3. Call **`start_review`** with `{ dir: "<this-project-dir>" }` to open the deck in the browser with the annotation overlay injected. Tell the user the URL it returns.
4. Wait for the user to come back (either they click "Done" in the browser, or just say "apply the comments" in chat).
5. Call **`get_annotations`** with `{ dir: "<this-project-dir>", format: "md" }` to read the feedback.
6. For each annotation: locate the corresponding text in `content.md` (use `element.text` as the anchor if the selector is ambiguous), apply the requested change.
7. Call **`build_deck`** again with the same design params.
8. Summarize what changed and ask if they want another round, a different design, or to publish.

## Design parameters for `build_deck`

deckmark has a 3-axis design system:

- **`style`** (single): `professional` (default) / `academic` / `fashion` / `technical` / `fun`
- **`mode`** (single): `light` (default) / `dark`
- **`motion`** (multi-select array): `slide-transitions` (default), `fragment-reveals`, `auto-animate`. Pass `[]` for no motion.

If the user asks to change the design mid-flow, just re-call `build_deck` with the new params. No content rewrite needed.

## Annotation data shape

Each annotation from `get_annotations` has:

- `slide.index` — zero-based slide number (matches the order in `content.md`).
- `slide.title` — first heading on the slide.
- `element.selector` — CSS selector to the targeted element in the rendered HTML.
- `element.text` — text content at annotation time. **Use this as the fallback anchor** when the selector doesn't lead you directly to the right markdown.
- `element.bbox` — bounding box (visual context only).
- `comment` — the user's change request.
- `status` — `open` or `resolved`. Pass `unresolved_only: true` to `get_annotations` to skip already-applied ones on re-reads.

Each session also has:

- `summary` — overall guidance from the Done dialog. Treat as a global theme, not a single change.
- `build_hash` — sha256 of the build at review start. If this differs from a later build, selectors may be stale.

## Behavior

- **Never ask the user to take screenshots.** The annotation system replaces that loop entirely.
- **Never invoke a `deckmark ...` shell command.** It does not exist. Everything is via MCP tools.
- Treat the `summary` field as overall guidance, not a single change request.
- After applying annotations, summarize what changed (briefly — not a full diff) and ask if they want another round.
- Don't change the design unilaterally. If you think a different style would suit better, *suggest* it; don't switch.

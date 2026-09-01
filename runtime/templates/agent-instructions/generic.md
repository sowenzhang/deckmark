# deckmark — agent instructions for this project

This project uses **deckmark**, an AI-agent plugin that builds slide decks with in-browser annotation. You drive deckmark exclusively through its **MCP tools** — never through a CLI. There is no `deckmark` binary to invoke.

## The eight MCP tools

You should already have access to these via the deckmark MCP server (`@deckmark`):

| Tool | When to call |
|---|---|
| `init_deck` | Once at the start of a new deck. |
| `build_deck` | After writing or editing `content.md`. Idempotent. Accepts design params (see below). |
| `audit_deck` | After a build and before human review. Returns deck-specific quality findings and an independent-critic packet; call again with the structured critique to persist the verdict. |
| `start_review` | After a build, to open the local review server in the user's browser. |
| `wait_for_close` | Optional — block until the user clicks "Done." |
| `get_annotations` | Whenever the user says "address the comments." Works even if Done was not clicked. |
| `stop_review` | Optional — server auto-stops 5 min after Done otherwise. |
| `publish_deck` | After the user is satisfied, to emit the final shareable artifact. |

## Workflow

1. Fill `deckmark.brief.json` with the audience, purpose, key takeaway, desired action, visual direction, motion intent, and narrative arc.
2. Edit `content.md` to reflect the outline. Slides are separated by `---` on its own line. Use message-led markdown headings (`#`) for slide titles.
3. Call **`build_deck`** with `{ dir: "<this-project-dir>", style, mode, motion, motion_style }` to render to `./build/index.html`.
4. Call **`audit_deck`** without a critique. Fix deterministic blockers, save requested rendered evidence under `.deckmark/artifacts/`, and send the returned critic prompt to a different-model reviewer when supported. Call `audit_deck` again with the structured critique, returned `run_id`, and returned `build_hash` as `prepared_build_hash`.
5. Call **`start_review`** with `{ dir: "<this-project-dir>" }` to open the accepted or advisory deck in the browser with the annotation overlay injected. Tell the user the URL it returns.
6. Wait for the user to come back.
7. Call **`get_annotations`** with `{ dir: "<this-project-dir>", format: "md" }` to read the feedback.
8. Apply each annotation and rebuild with the same design parameters.
9. Summarize what changed and ask if they want another round, a different design, or to publish.

## Design parameters for `build_deck`

deckmark has a 3-axis design system:

- **`style`** (single): `professional` (default) / `academic` / `fashion` / `technical` / `fun`
- **`mode`** (single): `light` (default) / `dark`
- **`motion`** (multi-select array): `slide-transitions` (default), `fragment-reveals`, `auto-animate`. Pass `[]` for no global motion; per-slide directives can still opt selected slides into motion.
- **`motion_style`**: `subtle` (default), `engaging`, or `cinematic`. Motion should direct attention or explain change, not decorate every slide.

Use a per-slide directive for selected motion moments: `<!-- deckmark: transition=slide fragments=engaging auto-animate -->`. Supported transitions are `none`, `fade`, `slide`, `zoom`, `convex`, and `concave`; fragments accept `none`, `subtle`, `engaging`, or `cinematic`.

## Quality gate

Beautiful means intentional, hierarchical, composed, specific, coherent, meaningful, and polished relative to the deck brief. The critic also evaluates narrative flow, credibility, memorability, and how representative, skeptical, and decision-making audience members will receive the message.

`quality.mode: "advisory"` reports weaknesses without blocking. `"blocking"` requires screenshots captured after the current build, an honestly reported different-model reviewer, matching source/build hashes, and prevents `publish_deck` when the report is missing, stale, or rejected. Deckmark records reviewer metadata but cannot independently prove which model the host dispatched.

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

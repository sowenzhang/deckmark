---
name: deckmark
description: Use when the user asks to create, build, or iterate on a slide deck. Tells the agent how to drive the deckmark MCP tools (init_deck, build_deck, start_review, wait_for_close, get_annotations, stop_review, publish_deck) and how to handle in-browser annotations and the three-axis design system.
---

# deckmark

deckmark is a workflow for building a slide deck *with* the user, where they review it by clicking directly on rendered elements in their browser to leave comments. You apply those comments back into the source markdown and rebuild.

## When to invoke

- The user typed `/use-deckmark <prompt>`.
- The user asked for a presentation, slide deck, talk, or slideshow and you have the deckmark MCP tools available.
- The user said "address the annotations," "apply the comments," or similar after a review round.
- The user asked to change the design ("make it darker", "switch to academic style") — call `build_deck` again with new design params; no content rewrite needed.

## The seven tools

| Tool | When |
|---|---|
| `init_deck` | Once at the start of a new deck. |
| `build_deck` | After writing or editing `content.md`, **or** when the user wants to change the design (style/mode/motion). Idempotent. |
| `start_review` | After a build, to open the review server. |
| `wait_for_close` | **Always call this immediately after `start_review`.** Blocks until the user clicks Done in the browser, or until `timeout_seconds` elapses (default 1800 = 30 min). Without it, clicking Done in the browser doesn't reach the agent and the workflow stalls. |
| `get_annotations` | Whenever the user says to address comments. Works even if Done was not clicked. |
| `stop_review` | Optional — the server auto-stops 5 min after Done. |
| `publish_deck` | After the user is satisfied. **Always ask the user `single-file` or `multi-file`** — both shapes are common, neither is "default." See "Publishing" below for what to say. |

## Three-axis design system

`build_deck` accepts three orthogonal design parameters:

### mode: `light` | `dark`

Color mode. Applies to every style via CSS variable swap.

### style: `professional` | `academic` | `fashion` | `technical` | `fun`

The visual personality:

| style | Identity | Pick when |
|---|---|---|
| `professional` (default) | Inter sans, restrained, indigo accent | Work, reports, proposals, generic business |
| `academic` | Fraunces + Source Serif, warm paper, terra accent | Research, scholarly, paragraph-heavy |
| `fashion` | Space Grotesk display, cream, amber accent, asymmetric | Brand launches, vision, marketing |
| `technical` | Inter + JetBrains Mono, dot-grid bg, cyan accent, terminal code | Engineering, demos, code-heavy talks |
| `fun` | Outfit display, warm cream, coral, rounded everything | Internal demos, retros, casual |

### motion: array of `slide-transitions` | `fragment-reveals` | `auto-animate`

Multi-select. Pass an array (e.g., `['slide-transitions', 'fragment-reveals']`). Pass `[]` for no motion at all.

### slideNumbers (optional)

Pass `slideNumbers: true` to `build_deck` to show "3/8" style page numbers in the corner. Defaults to `false`. Custom reveal.js formats accepted: `'c'` (current only), `'c/t'` (current/total — same as `true`), `'h.v'`, `'h/v'` (horizontal + vertical indices).

| flag | Effect |
|---|---|
| `slide-transitions` | Animate between slides using the style's preferred transition (fade for professional/academic/technical, slide for fashion, zoom for fun). Without this, slides jump instantly. |
| `fragment-reveals` | List items appear one at a time as the user advances. Engine auto-adds `class="fragment"` to every `<li>`. |
| `auto-animate` | Matching elements morph between consecutive slides (good for diagram build-ups, before/after comparisons). Engine adds `data-auto-animate` to every `<section>`. |

### Mapping natural language

If the user describes design in words, map to the three axes:

- "professional" / "Stripe-style" / "clean" / "corporate" → `style: professional`
- "academic" / "research" / "scholarly" / "long-form" → `style: academic`
- "marketing" / "brand" / "launch" / "vision" / "bold" → `style: fashion`
- "technical" / "engineering" / "code" / "terminal" → `style: technical`
- "casual" / "fun" / "internal" / "demo" → `style: fun`
- "dark" / "dark mode" / "night" → `mode: dark`
- "no animation" / "print-friendly" / "static" → `motion: []`
- "smooth" / "animated" → `motion: ['slide-transitions']`
- "build up" / "reveal one at a time" → add `'fragment-reveals'`

### Style influences content, not just visuals

Write `content.md` to suit the chosen style:

- `professional` — balanced bullets, concrete numbers, clear sections
- `academic` — flowing prose, citations, longer reading depth
- `fashion` — short punchy headlines, big claims, generous whitespace
- `technical` — code blocks generous, terminal output, diagrams
- `fun` — conversational tone, friendly framing, light commentary

Same content can look great in any style; tuning the prose to the personality is what makes the chosen style feel intentional.

## Annotation data shape

Each annotation has:

- `slide.index` — zero-based slide number in the markdown.
- `slide.title` — the slide's first heading (extracted at build time).
- `element.selector` — CSS selector targeting the element in the rendered HTML.
- `element.dom_path` — short human-readable DOM path.
- `element.tag` — element tag name.
- `element.text` — text content at annotation time; use this to locate the corresponding markdown when the selector is ambiguous.
- `element.bbox` — bounding box (visual context).
- `comment` — the user's change request.
- `status` — `open` or `resolved`. Pass `unresolved_only: true` to `get_annotations` to skip already-applied ones on re-reads.

Each session also has:

- `summary` — overall guidance from the Done dialog. Apply as a global theme, not a single change.
- `build_hash` — sha256 of the build at review start; if it differs from a later build, selectors may be stale.

## Workflow

```
ask design (mode/style/motion) + content (audience/length)
  ↓
init_deck → write content.md → build_deck(style, mode, motion)
  ↓
start_review → [user annotates in browser]
  ↓
wait_for_close (1800s default — returns when user clicks Done OR on timeout)
  ↓
get_annotations → for each: locate in content.md, apply change → build_deck
  ↓
ask "another round?" → loop, OR
ask "change the design?" → build_deck with new params, OR
ask "publish?" → ask single-file or multi-file → publish_deck
```

## Hand-off conventions

- After `start_review`, tell the user the URL clearly, remind them *press A to annotate, click an element, type a comment, then Done*, **and immediately call `wait_for_close`** in the same turn. Do not return control to chat between these — the Done click only reaches you if `wait_for_close` is actively polling.
- After `wait_for_close` returns (closed:true or timed_out:true), call `get_annotations` and apply the comments.
- After applying annotations, summarize what changed (not the whole diff). Ask if they want another round.
- Before `publish_deck`, ask the user `single-file` vs `multi-file` — see "Publishing" below.
- After `publish_deck`, give them the output path.

## Done-signal contract: always wait_for_close after start_review

Clicking "Done" in the overlay writes `closed: true` to the session JSON on disk. **It does not send any signal to the agent.** The agent finds out only by actively polling that file — which is exactly what `wait_for_close` does (1-second poll, returns within ~1 second of Done).

If you call `start_review` and then return control to chat without `wait_for_close`, the user clicks Done expecting you to react, and nothing happens. They have to send a chat message to wake you up. That is a bad UX and the case this contract prevents.

The right shape every iteration:

```
start_review → tell user URL → wait_for_close (1800s timeout)
  ↓ returns
get_annotations → apply changes → build_deck → next start_review → wait_for_close …
```

`wait_for_close`'s default 1800 s (30 min) is intentionally generous. If the user walks away, it returns `timed_out: true` and you proceed by calling `get_annotations` anyway (there may be partial annotations to apply). Never split `start_review` and `wait_for_close` across turns; never end your turn while a review session is live without `wait_for_close` running.

## Publishing

When the user says "publish", do not pick a mode for them. Ask:

> Two options for publishing:
> - **single-file** — one self-contained `.html` (~1-2 MB). Easiest to email, attach to a message, copy to a USB drive, or send over chat. Opens directly in any browser, no server needed.
> - **multi-file** — a `published/` folder containing `index.html` and a `vendor/` directory of assets. Better for hosting on a static site (GitHub Pages, Netlify, S3, an internal web server) — smaller cacheable files mean faster repeat loads, and you can swap out individual images later without re-publishing the whole deck.
>
> Which do you want?

Then call `publish_deck` with the chosen `mode`. Default output naming:
- single-file: `<deck-folder-name>.html` (e.g., a deck at `./q2-results-deck/` → `q2-results-deck.html`)
- multi-file: `./published/` with entry `index.html`

Override `out` only if the user explicitly asks for a different name or location.

## Each iteration is a NEW review session — never reuse the old URL

The biggest workflow mistake is telling the user to "refresh the previous URL" after applying annotations. **Don't.** The previous review server is dead the moment the user clicked Done (it auto-shuts down 5 minutes later). Telling the user to refresh `http://127.0.0.1:12902` (or whatever) after the next `build_deck` will fail — the port is closed.

The correct loop after applying annotations:

```
1. build_deck   ← rebuild with the same style/mode/motion/slideNumbers params
2. start_review ← THIS RETURNS A NEW URL AND A NEW SESSION_ID
3. Tell the user the NEW URL — explicitly, even if it looks similar.
   e.g., "Updated. Open http://127.0.0.1:<NEW PORT> to review."
```

Each `start_review` call:
- creates a brand new annotation session JSON file
- starts a new Fastify server on a fresh ephemeral port
- returns a new `url` + `session_id`

Never assume the old port is reachable. Never tell the user to refresh a stale tab without re-fetching the URL from a fresh `start_review`. If the user keeps a tab open and you give them the new URL, they can just paste it into the same tab.

If you applied annotations *without* running a new `start_review`, the deck still updates on disk but the user has no way to see it. Always pair "applied changes" with "here's the new review URL."

## Pitfalls

- Don't ask the user to take screenshots; the annotation system replaces that loop.
- Don't rewrite content wholesale to "improve" things — only address the annotations and the summary.
- Don't call `build_deck` while the user is mid-annotation — selectors will go stale.
- Don't keep multiple review sessions open simultaneously; the auto-shutdown handles it but you can call `stop_review` explicitly.
- Don't change the design unilaterally — it's the user's choice. *Suggest* a different style if you think it'd fit better; don't switch without asking.

## If the MCP tools aren't available — STOP, don't improvise

If you cannot call `init_deck` / `build_deck` / `start_review` / `get_annotations` / `publish_deck` in this session (the deckmark MCP server didn't load, the plugin is misconfigured, or you don't see `mcp__deckmark__*` tools in your tool list), **do not fall back to manually generating HTML via shell commands**. There is no useful version of deckmark without the live MCP server — the annotation overlay, the review-server-with-Done-button, and the agent-readable session JSON all depend on it. A hand-rolled `preview.html` is *not* deckmark; it's a static slide deck the user can't annotate.

When you detect missing MCP tools:

1. Tell the user clearly: *"The deckmark MCP server isn't loaded in this session, so I can't run the annotation flow."*
2. Suggest the fix: usually a plugin reinstall + Claude Code restart. If the install was recent and the cache is stale, the user may need to wipe `~/.claude/plugins/cache/deckmark-dev/` and `installed_plugins.json`'s `deckmark@deckmark-dev` entry, then reinstall.
3. **Stop.** Don't proceed without the tools.

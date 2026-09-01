---
name: deckmark
description: Use when the user asks to create, build, audit, or iterate on a slide deck. Tells the agent how to drive the deckmark MCP tools, define the audience and message contract, run the beauty/narrative/audience quality gate, and handle in-browser annotations.
---

# deckmark

deckmark is a workflow for building a slide deck *with* the user, where they review it by clicking directly on rendered elements in their browser to leave comments. You apply those comments back into the source markdown and rebuild.

## When to invoke

- The user typed `/deckmark:use-deckmark <prompt>`.
- The user asked for a presentation, slide deck, talk, or slideshow and you have the deckmark MCP tools available.
- The user said "address the annotations," "apply the comments," or similar after a review round.
- The user asked to change the design ("make it darker", "switch to academic style") — call `build_deck` again with new design params; no content rewrite needed.

## The eight tools

| Tool | When |
|---|---|
| `init_deck` | Once at the start of a new deck. |
| `build_deck` | After writing or editing `content.md`, **or** when the user wants to change the design (style/mode/motion). Idempotent. |
| `audit_deck` | After a build and before human review. Produces deterministic findings and an independent-critic packet; call it again with the critic response to persist an accept/revise verdict. |
| `start_review` | After a build, to open the review server. |
| `wait_for_close` | **Always call this immediately after `start_review`.** Blocks until the user clicks Done in the browser, or until `timeout_seconds` elapses (default 1800 = 30 min). Without it, clicking Done in the browser doesn't reach the agent and the workflow stalls. |
| `get_annotations` | Whenever the user says to address comments. Works even if Done was not clicked. |
| `stop_review` | Optional — the server auto-stops 5 min after Done. |
| `publish_deck` | After the user is satisfied. **Always ask the user `single-file` or `multi-file`** — both shapes are common, neither is "default." See "Publishing" below for what to say. |

## Design system

`build_deck` accepts three orthogonal design axes plus a motion character:

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

Multi-select. Pass an array (e.g., `['slide-transitions', 'fragment-reveals']`). Pass `[]` for no global motion. A per-slide directive can still opt a selected slide into motion; `audit_deck` includes that override in its authoritative motion metadata.

### motion_style: `subtle` | `engaging` | `cinematic`

Controls how enabled motion feels:

| value | Use when |
|---|---|
| `subtle` (default) | The material should feel calm, precise, executive, or academic. |
| `engaging` | Directional staging and progressive disclosure will help the audience follow the argument. |
| `cinematic` | A small number of high-impact transitions support a launch, vision, or emotional story. |

Motion must earn its place. Use it to direct attention, explain change, stage complexity, or create a deliberate pause. Do not enable every motion flag merely to make the deck feel active.

For a specific high-value slide, add a source directive instead of making the whole deck dramatic:

```html
<!-- deckmark: transition=slide fragments=engaging auto-animate -->
```

Supported values are `transition=none|fade|slide|zoom|convex|concave`, `fragments=none|subtle|engaging|cinematic`, and `auto-animate` or `auto-animate=false`. An `auto-animate` directive applies to the transition from the previous slide into the directive's slide, so deckmark marks the adjacent pair. Prefer one or two intentional motion moments over constant novelty.

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
- "engaging" / "dynamic" / "progressive" → `motion_style: engaging`
- "cinematic" / "dramatic launch" → `motion_style: cinematic`

## The quality contract

`init_deck` creates `deckmark.brief.json`. Fill it before writing the final deck:

- `audience.description` and `audience.familiarity`
- `setting` and available presentation time
- `purpose`
- `key_takeaway`
- `desired_action`
- likely audience needs and objections
- `tone` and `visual_direction`
- `motion_intent`
- `narrative_arc`
- `quality.mode`: `advisory` or `blocking`

Do not treat audience as a demographic label. Describe what they know, what they care about, what they may resist, and what decision or behavior the deck should produce.

## Definition of beautiful

A beautiful deck is:

1. **Intentional** — it commits to a visual direction that fits the audience and message.
2. **Hierarchical** — every slide makes its point and reading order immediately obvious.
3. **Composed** — scale, alignment, whitespace, density, and rhythm feel deliberate.
4. **Specific** — it does not look interchangeable with an unrelated generated deck.
5. **Coherent** — typography, color, imagery, and layout form one system without making every slide identical.
6. **Meaningful** — visuals and motion clarify the argument rather than decorate it.
7. **Polished** — the audience notices the message rather than construction mistakes.

Beauty is judged against the brief, not a universal preferred style. A restrained board deck and an expressive launch deck can both be beautiful.

## Quality-gate workflow

After the first build:

1. Call `audit_deck` without `critique`. Read its deterministic findings, screenshot plan, critic prompt, and response schema.
2. Fix obvious P1 issues before paying for an independent review.
3. When browser or screenshot tooling is available, capture every settled slide as PNG **after the current build completes**. For fragments or auto-animate, also capture the most important before/after pair. Save artifacts under `.deckmark/artifacts/`; other locations are rejected so review evidence cannot leak into published output.
4. Dispatch the returned critic prompt **once per quality pass** to a read-only reviewer on a model different from the builder when the host supports it. Prime the reviewer with the supplied deterministic hypotheses; do not merely say "review this deck."
5. If a different-model reviewer is unavailable, perform a cold self-review and report `reviewer.independent: false`. This is allowed in advisory mode but cannot satisfy blocking mode.
6. Call `audit_deck` again with `critique`, `artifacts`, the returned `run_id`, `build_hash` as `prepared_build_hash`, `packet_hash` as `prepared_packet_hash`, and `iteration` (`1` through `3`). Reuse the same `run_id` across revision passes. If the brief, deterministic findings, artifact metadata, or screenshot bytes change after preparation, prepare a new packet before submitting the critique.
7. On `revise`, fix only blocking findings first, rebuild, and capture a fresh static set for the rebuilt deck plus the affected motion states. Stop when accepted or when `stop.stop` reports `cap`, `plateau`, or `regression`.
8. Only after the quality pass, start the user's annotation review. Human feedback remains the final authority.

The critic evaluates:

- visual intent, hierarchy, composition, distinctiveness, polish, and content/visual fit
- whether motion controls attention or explains change
- slide-to-slide logic, setup, evidence, payoff, and closing action
- audience comprehension, credibility, objections, likely reaction, recall, and action clarity

In blocking mode, `publish_deck` refuses a missing, rejected, or stale quality report. Any rebuild invalidates the prior accepted report.

Reviewer independence is recorded from the host's reviewer metadata; deckmark cannot independently prove which model the host dispatched. The workflow requires the agent to report this honestly, and blocking mode rejects an explicitly non-independent review.

### Style influences tone, not structure

Write `content.md` to suit the chosen style:

- `professional` — balanced bullets, concrete numbers, clear sections
- `academic` — flowing prose, citations, longer reading depth
- `fashion` — short punchy headlines, big claims, generous whitespace
- `technical` — code blocks generous, terminal output, diagrams
- `fun` — conversational tone, friendly framing, light commentary

Same content can look great in any style; tuning the prose to the personality is what makes the chosen style feel intentional.

Before drafting any slides, lock the narrative first:

- define audience + decision goal ("what should this deck change?")
- agree on 3–6 core arguments
- map a simple arc (problem → evidence → conclusion / next step)
- assign one primary point per slide in the outline

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

## Workflow (Plan → Draft → Refine)

```
ask design + audience/message/outcome
  ↓
init_deck → plan storyline with user (audience/goals/core arguments/outline)
  ↓
fill deckmark.brief.json → write content.md from the approved outline → build_deck
  ↓
audit_deck → independent critic → bounded revise/accept loop
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

- After `start_review`, tell the user the URL clearly, remind them *press A to annotate, click an element, type a comment, then Done*, **and** mention that they can also just send a chat message ("apply the comments", "publish it", etc.) without clicking Done — both paths work. Then immediately call `wait_for_close` in the same turn (see "Done-signal contract" below).
- After `wait_for_close` returns (closed:true OR timed_out:true), call `get_annotations` and apply the comments.
- After applying annotations, summarize what changed (not the whole diff). Ask if they want another round.
- Before `publish_deck`, ask the user `single-file` vs `multi-file` — see "Publishing" below.
- After `publish_deck`, give them the output path.

## Done-signal contract: wait_for_close after start_review (both paths supported)

Clicking "Done" in the overlay writes `closed: true` to the session JSON on disk. **It does not send any signal to the agent.** The agent finds out only by actively polling that file — which is exactly what `wait_for_close` does (1-second poll, returns within ~1 second of Done).

So always call `wait_for_close` immediately after `start_review`, in the same turn. That gives the user the "click Done, agent picks up instantly" path.

The chat path is also fully supported via Claude Code's interrupt: while `wait_for_close` is polling, the user can press **Esc** in chat to cancel the current tool call, then type a message — *"apply the comments", "publish as single file", "make slide 3 bolder", etc.* The agent then proceeds normally (calls `get_annotations`, applies, etc.).

Tell the user both paths exist in your hand-off message — so they can choose without learning a workflow. Example:

> Deck at http://127.0.0.1:<port>. Press `A` to annotate any element, then click ✓ Done when you're finished — I'll pick up right away. Or come back here any time and tell me what you want changed (press Esc first if I'm still waiting).

Both paths land in the same place: `wait_for_close` returns, you call `get_annotations`, you apply.

If `wait_for_close` returns `timed_out: true` after the default 30 minutes, the user walked away. Still call `get_annotations` — there may be partial annotations to apply, or the user may come back to chat later.

Never split `start_review` and `wait_for_close` across turns; never end your turn while a review session is live without `wait_for_close` running.

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
- After human annotation begins, don't rewrite content wholesale under the quality rubric — address the user's annotations and summary unless they request a broader pass.
- Don't call `build_deck` while the user is mid-annotation — selectors will go stale.
- Don't keep multiple review sessions open simultaneously; the auto-shutdown handles it but you can call `stop_review` explicitly.
- Don't change the design unilaterally — it's the user's choice. *Suggest* a different style if you think it'd fit better; don't switch without asking.

## If the MCP tools aren't available — STOP, don't improvise

If you cannot call `init_deck` / `build_deck` / `start_review` / `get_annotations` / `publish_deck` in this session (the deckmark MCP server didn't load, the plugin is misconfigured, or you don't see `mcp__deckmark__*` tools in your tool list), **do not fall back to manually generating HTML via shell commands**. There is no useful version of deckmark without the live MCP server — the annotation overlay, the review-server-with-Done-button, and the agent-readable session JSON all depend on it. A hand-rolled `preview.html` is *not* deckmark; it's a static slide deck the user can't annotate.

When you detect missing MCP tools:

1. Tell the user clearly: *"The deckmark MCP server isn't loaded in this session, so I can't run the annotation flow."*
2. Suggest the fix: usually `/plugin marketplace update deckmark-marketplace` + `/plugin install deckmark@deckmark-marketplace` + a Claude Code restart. If the marketplace mirror is stale, wipe `~/.claude/plugins/cache/deckmark-marketplace/` and remove the `deckmark@deckmark-marketplace` entry from `~/.claude/plugins/installed_plugins.json` before reinstalling.
3. **Stop.** Don't proceed without the tools.

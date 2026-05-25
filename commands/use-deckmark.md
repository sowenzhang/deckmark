---
description: Build an annotated presentation with deckmark
argument-hint: <topic and any design direction (style, mode, motion)>
---

You are running the **deckmark** workflow. The user has invoked this command to build a presentation that they will then review by clicking directly on rendered slide elements in their browser.

## What the user gave you

$ARGUMENTS

## Gathering the design (three axes)

deckmark separates visual design into three orthogonal choices:

- **mode** — `light` or `dark`
- **style** — `professional` | `academic` | `fashion` | `technical` | `fun`
- **motion** — multi-select of `slide-transitions` | `fragment-reveals` | `auto-animate`

### Step 1: try to infer from the user's brief

If the brief above already specifies design direction (e.g., "Stripe-style", "dark mode", "academic", "no animations", "playful"), map it to the three axes without asking:

| Natural-language hint | maps to |
|---|---|
| "professional", "corporate", "business", "SaaS", "Stripe-style", "clean" | `style: professional` |
| "academic", "scholarly", "research", "long-form", "magazine" | `style: academic` |
| "fashion", "marketing", "launch", "brand", "vision", "bold", "punchy" | `style: fashion` |
| "technical", "engineering", "developer", "code-heavy", "terminal" | `style: technical` |
| "casual", "fun", "friendly", "demo", "internal", "team" | `style: fun` |
| "dark", "dark mode", "night" | `mode: dark` |
| "light", "white" | `mode: light` |
| "no animation", "static", "print-friendly" | `motion: []` |
| "smooth", "transitions", "animated" | `motion: ['slide-transitions']` (add `'fragment-reveals'` if "reveal" or "build-up" mentioned) |

If the brief is fully specified, **skip Step 2 entirely** and proceed to scaffold.

### Step 2: ask the user — all three axes must be covered

Every deck needs decisions on all three axes. Check the brief: for each axis that is NOT explicitly specified, you **must** ask the user — never silently use a default.

**Motion is the easiest axis to skip — don't.** Topics rarely hint at motion preferences, so this is almost always one you have to ask.

If you have the `AskUserQuestion` tool, use **one** call with one question per unspecified axis (up to 3 questions in a single call):

- **mode** (single-select, 2 options): Light / Dark
- **style** (single-select, 4 options): Professional / Academic / Fashion / Fun. *Replace Fun with Technical if the topic is engineering/code/devtools/dev-tools-flavored.* If the user picks "Other" for style, infer Technical from their text or fall back to professional.
- **motion** (multi-select, 3 options): Slide transitions / Fragment reveals / Auto-animate. **Pre-check Slide transitions** as the most common default; user can uncheck if they want a static deck.

If you do NOT have `AskUserQuestion`, ask the same questions inline in **one combined message** with three clearly labeled sections. Don't ask one axis at a time — users prefer answering everything together. Number each section's options (1/2/3...) and tell the user to reply with the numbers (e.g., "1, A, 2+3"). Example:

```
A few design questions before I scaffold:

**Mode**:
  1. Light    2. Dark

**Style**:
  A. Professional  B. Academic  C. Fashion  D. Technical  E. Fun

**Motion** (you can pick multiple, comma-separated, or "none"):
  i. Slide transitions    ii. Fragment reveals    iii. Auto-animate

(Default if you skip: Light / Professional / Slide transitions only.)
Or just describe the look you want in plain words — I'll map it.
```

If the user gives a partial free-form answer like "technical + dark", great — accept it and ask **only the remaining axis** ("Got it, technical + dark. Any motion preference — slide transitions, fragment reveals, auto-animate? Default is just slide transitions."). Never proceed to scaffolding with an unanswered axis silently filled by a default.

Defaults to use only when the user explicitly declines or says "you pick": `mode: light`, `style: professional`, `motion: ['slide-transitions']`.

### Step 3: a few content questions (always ask, briefly)

- Audience
- Approximate length (3-5, 5-10, 10+ slides)
- Any specific points or sections they want covered

Keep it tight — one combined message. Don't bury the user under a survey.

## Then build, review, iterate

1. Pick a slug-cased folder name from the topic (e.g., `q2-results-deck/`).
2. Call `init_deck` with `{ dir: "<slug>", agent: "claude" }` (or whichever agent applies; `"generic"` if unsure).
3. Write `content.md` inside the scaffolded folder. Use `---` on its own line between slides. Match the chosen style when writing:
   - `professional` — balanced bullet points, clear sections, concrete numbers
   - `academic` — flowing prose, citations, longer reading depth
   - `fashion` — short punchy headlines, big claims, generous whitespace
   - `technical` — code blocks generous, terminal output, diagrams
   - `fun` — conversational tone, friendly framing, light commentary
4. Call `build_deck` with `{ dir: "<slug>", style, mode, motion }`.
5. Call `start_review` with `{ dir: "<slug>" }`. Tell the user something like: *"Deck at <url> — press A to annotate any element, then click Done in the browser."*
6. **Immediately call `wait_for_close`** with the returned `session_id` (default 1800 s timeout) in the same turn. Do not end your turn here — Done in the browser only reaches you while `wait_for_close` is polling. When it returns (closed or timed out), proceed to step 7.
7. Call `get_annotations` with `{ dir: "<slug>", format: "md" }`.
8. For each annotation, locate the matching markdown in `content.md` (use `element.text` as the fallback anchor) and apply the change. Treat the `summary` field as global guidance.
9. Re-run `build_deck` with the same design args.
10. **Call `start_review` again immediately followed by `wait_for_close`** — same contract as step 5+6. The previous review server is dead (auto-shutdown). Never tell the user to refresh the old URL, and never split start_review and wait_for_close across turns.
11. Summarize what changed and give them the **new** URL. Ask if they want another round or to publish. If they say change the look, just re-call `build_deck` with a new `style` / `mode` / `motion` and then a new `start_review`.
12. On "publish", **ask the user which mode they want — never silently default**. Present the tradeoff in one short message:

    > Two options for publishing:
    > - **single-file** — one self-contained `.html` (~1-2 MB). Easiest to email, attach to a message, copy to a USB drive, or send over chat. Opens directly in any browser, no server needed.
    > - **multi-file** — a `published/` folder containing `index.html` and a `vendor/` directory of assets. Better for hosting on a static site (GitHub Pages, Netlify, S3, an internal web server) — smaller cacheable files mean faster repeat loads, and you can swap out individual images later without re-publishing the whole deck.
    >
    > Which do you want?

    Then call `publish_deck` with `{ dir: "<slug>", mode: "single-file" | "multi-file" }`. The output is named after the deck folder by default — for `q2-results-deck`, single-file produces `q2-results-deck.html`; multi-file produces `published/index.html` (+ vendored assets). Override the name with the `out` parameter if the user wants a different filename or folder.

## Behavior notes

- Never ask the user to take screenshots; the annotation system replaces that loop.
- Don't change the design unilaterally — it's the user's choice. If you think a different style would suit the content better, *suggest* it; don't switch.
- If `wait_for_close` times out (timed_out:true), still call `get_annotations` — there may be partial annotations to apply, or the user may have come back to chat to redirect.
- The user can pivot the entire design at any point with one prompt ("make it darker", "switch to academic"). Honor it with a single `build_deck` call.

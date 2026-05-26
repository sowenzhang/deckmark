---
name: release-deckmark
description: Use when releasing a new version of deckmark or re-tagging an existing version. Covers the bump-or-retag decision, three-file version sync, CI wait, post-release npx-cache wipe, and install verification — everything needed to ship a release that real users will actually receive.
---

# release-deckmark

End-to-end checklist for cutting a deckmark release. Follow top-to-bottom;
skip nothing. Every step here exists because forgetting it has bitten us
at least once.

## Pre-flight (1 minute)

Run these in the repo root before touching versions or tags.

```
git checkout main && git pull --ff-only
npm test
npm run build
```

All three must succeed. If any fails, fix before continuing — a broken
release is worse than no release.

Then decide:

- **Bumping to a new version** (e.g., 1.0.0 → 1.0.1)? Use the "Bump"
  path below. **Default to this.** Semver says published artifacts under
  a given version shouldn't change.
- **Re-tagging the same version**? Use the "Re-tag" path. Only do this
  if the release happened minutes ago and you're confident no one has
  cached the bad bytes yet. Tell the user the trade-off and confirm
  before proceeding.

## Path A: Bump (default)

1. **Sync three version files**. CI will reject the release if any
   disagree with the tag:
   - `package.json` → `"version"`
   - `.claude-plugin/plugin.json` → `"version"`
   - `.claude-plugin/marketplace.json` → the entry's `"version"`

2. **Commit and tag**:
   ```
   git add package.json .claude-plugin/plugin.json .claude-plugin/marketplace.json
   git commit -m "chore(release): X.Y.Z"
   git tag vX.Y.Z
   ```

3. **Push commit AND tag** (separately — pushing the branch doesn't
   push tags):
   ```
   git push origin main
   git push origin vX.Y.Z
   ```

The tag push triggers `.github/workflows/release.yml`.

## Path B: Re-tag same version

Only when re-publishing within minutes of the original release.

1. **Delete the existing GitHub Release in the browser**. The `gh` CLI
   isn't installed locally — navigate to the release URL on GitHub and
   click the trash icon → "Delete this release". This removes the
   Release but leaves the tag.

2. **Delete the tag remotely, then locally**:
   ```
   git push origin :refs/tags/vX.Y.Z
   git tag -d vX.Y.Z
   ```

3. **Sync main and re-tag at HEAD**:
   ```
   git checkout main && git pull --ff-only
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

## Wait for CI (~2 minutes)

The workflow runs install → build → test → pack → upload tarball. It
will fail loudly if:

- The tag doesn't match `package.json#version`.
- Tests fail on Ubuntu Node 22 (we don't have Windows CI yet — watch
  for path-separator bugs that pass locally but fail there).

Verify CI passed before continuing. The release is live when
`https://github.com/sowenzhang/deckmark/releases/latest/download/deckmark.tgz`
serves the new tarball.

## Post-release verification (3 minutes — DO NOT SKIP)

The release being on GitHub doesn't mean users will see it. `npx` keys
its cache by URL, not contents, so the same URL with new bytes is still
served from cache.

1. **Confirm the tarball URL resolves** to the new release:
   ```powershell
   curl -sIL https://github.com/sowenzhang/deckmark/releases/latest/download/deckmark.tgz |
     Select-String -Pattern '(?i)^(location|content-length):' | Select-Object -First 6
   ```
   Expect a `302` redirecting to `releases/download/vX.Y.Z/deckmark.tgz`.

2. **Wipe the npx cache**:
   ```powershell
   Remove-Item -Recurse -Force "$env:LOCALAPPDATA\npm-cache\_npx"
   ```
   (macOS/Linux: `rm -rf ~/.npm/_npx`.)

3. **Refresh the marketplace mirror inside Claude Code**:
   ```
   /plugin marketplace update deckmark-marketplace
   ```

4. **Restart Claude Code** so the MCP server re-spawns and re-fetches
   the tarball.

5. **Verify the installed code matches** what you shipped. Find the
   npx-extracted package and grep for an identifier unique to this
   release:
   ```powershell
   $deck = Get-ChildItem "$env:LOCALAPPDATA\npm-cache\_npx" -Directory |
     Where-Object { Test-Path "$($_.FullName)\node_modules\deckmark" } |
     Select-Object -First 1 -ExpandProperty FullName
   Select-String -Path "$deck\node_modules\deckmark\dist\runtime\engines\reveal.js" `
     -Pattern '<unique-identifier-from-this-release>'
   ```
   For v1.0.0 the load-bearing identifiers are `rejectSymlink`,
   `deckmark-build`, `isUnder`, `assertDirOrAbsent`. Pick one that's
   new in *your* release.

6. **End-to-end smoke test**. In Claude Code:
   - `/mcp` → confirm deckmark shows **connected**.
   - Ask the agent: *"use deckmark to make a one-slide deck about
     anything, build it, and publish multi-file."*
   - Double-click the resulting `published/index.html` and confirm it
     renders without manual edits. (This is the file:// regression
     check — relative `vendor/reveal/...` paths must work.)

## When something goes wrong

| Symptom | First check |
|---|---|
| CI fails with "tag does not match version" | All three version files in sync? Did you push the tag at the same HEAD as the version-bump commit? |
| Release exists on GitHub but install runs old code | npx cache wasn't wiped. Repeat step 2 in "Post-release verification". |
| MCP server disconnects after release | Marketplace mirror is stale. `/plugin marketplace update`, restart Claude Code. |
| Published HTML opens blank via file:// | Some `vendor/reveal/` reference still has a leading `/`. Grep the released `dist/runtime/engines/reveal.js` for `REVEAL_PREFIX = '/vendor/reveal'` — if found, the wrong code shipped. |

For deeper issues, see `docs/troubleshooting.md`.

## Pitfalls (things that have bitten us)

- **Pushing the branch but not the tag.** `git push origin main` does
  NOT push tags. Push the tag explicitly.
- **Re-tagging without deleting the GitHub Release first.** The
  `softprops/action-gh-release@v2` action will update an existing
  release, but the experience is cleaner if you delete and let it
  recreate. Also keeps release notes regenerating from the right
  boundary.
- **Forgetting one of the three version files.** CI catches this, but
  you'll have wasted a CI run.
- **Trusting "the release is live" without wiping the npx cache.** The
  cache is URL-keyed, and the URL doesn't change between versions —
  this is the #1 reason "my fix shipped but I'm still seeing the bug."
- **Skipping the file:// smoke test.** The dev server hides this class
  of bug because it has its own route. Multi-file publish + double-click
  is the only honest check.

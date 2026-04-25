# Release Checklist Action — Spec (v2)

## Problem

On release night, infra/config dependencies from tickets completed weeks earlier get missed. The knowledge exists at PR time but isn't surfaced at release time. Runbooks and Jira comments are too buried to be reliable.

## Idea

A reusable GitHub Action published in its own repo. Developers flag release-time dependencies inline as they complete their work, and the action aggregates those flags into a sign-off checklist posted as a comment directly on the Release Please PR — where the release manager is already looking. Any team can adopt it with a single line in their workflow.

## Scope

This v1 targets repos using Release Please in **single-package mode** (one open Release Please PR at a time). Manifest/monorepo mode is explicitly out of scope.

## Developer Convention

Any commit message or PR description can include one or more release tags using this format:

```
[release: words go here]
```

Examples:

```
feat: add supplier invoice webhook [release: add INVOICE_WEBHOOK_SECRET to prod env]
fix: swap redis cache driver [release: update CACHE_DRIVER=redis in all environment configs]
chore: add alembic migration for supplier table [release: run db migrations before deploying]
feat: new document store index [release: re-index docstore after deploy - see migration guide]
[release: notify on-call team before releasing - touches payment flow]
```

- Freeform text only — no predefined categories or taxonomy
- Text should describe what someone needs to do, not what the commit changed
- Multiple tags per commit are fine
- Can appear anywhere in the commit message or PR description body
- Tags inside fenced code blocks in PR descriptions are ignored (so README-style examples in PR descriptions don't get picked up)
- Match is case-insensitive on `release`, single-line only

## How It Works

1. Triggers on every push to `main` (same event Release Please watches)
2. Must run after the Release Please job (`needs: release-please`) so the PR exists before the comment logic fires
3. Finds the currently open Release Please PR. If none exists yet, exits silently
4. Enumerates commits directly from the Release Please PR via `pulls/{number}/commits` (rather than computing the diff from the last tag — Release Please already knows what's in the pending release)
5. For each commit, checks the commit message and any associated PR description for `[release: ...]` tags
6. Deduplicates: if the same tag text appears across multiple sources (commit message + PR body, or two separate commits), emit it once with all originating commits linked
7. **Preserves checkbox state from the existing comment** (see below)
8. Upserts a single bot comment on the Release Please PR — created on first run, updated on subsequent pushes as more commits land

## Checkbox State Preservation

This is the critical bit. The release manager (and developers prepping ahead of release night) will tick items off as they go. New pushes to `main` must not reset that state.

**Identity:** items are identified by their tag text (the human-visible string). SHA can change on force-push or amend; text is the stable key.

**Algorithm on each run:**

1. Fetch the existing checklist comment, if any
2. Parse out a `Map<tagText, checked>` from the existing markdown — read `- [x]` vs `- [ ]` directly from the visible content; the comment is the source of truth
3. Build the new set of tags from the current commit range
4. For each new tag: if it exists in the previous map, carry over its checked state; otherwise default to unchecked
5. Items that no longer appear in the commit range (e.g. a commit was reverted or force-pushed away) drop out of the list
6. Render and upsert

**Ordering:** items render in chronological commit order. This means newly-added items appear at the bottom on subsequent runs, so the release manager doesn't see things shuffle around between pushes.

**Edge case — tag text edited:** if a developer amends a commit to fix a typo in their tag, it counts as a new item and resets to unchecked. Acceptable; rare; the previous checked state was for slightly different text anyway.

**Empty case:** if the current run produces zero items but a previous run had some, the comment updates to indicate no items are currently flagged rather than leaving a stale checklist sitting there. If there have never been any items, no comment is posted at all.

## Output

A living comment on the Release Please PR:

```
## 📋 Release Checklist

The following items were flagged by developers as requiring attention at release time:

- [ ] add INVOICE_WEBHOOK_SECRET to prod env (`a1b2c3`)
- [x] update CACHE_DRIVER=redis in all environment configs (`d4e5f6`)
- [ ] run db migrations before deploying (`g7h8i9`, `m3n4o5`)
- [ ] re-index docstore after deploy - see migration guide (`j0k1l2`)

_Updated 25 Apr 2026 · [What is this?](link-to-readme)_

<!-- release-checklist-action:marker -->
```

Items linked to multiple commits show all SHAs. Checkboxes are interactive in GitHub — release managers and developers tick them off directly on the PR as items are completed, and that state is preserved across subsequent pushes.

## Repo Structure

Standalone reusable action in its own repository (e.g. `your-org/release-checklist-action`).

```
release-checklist-action/
  action.yml        # Action metadata and input definitions
  src/
    index.ts        # Main entry point
    parser.ts       # [release: ...] tag extraction
    comment.ts      # Existing-comment parsing + state merge
    github.ts       # PR detection and comment upsert
  dist/
    index.js        # Compiled + bundled output (committed)
  package.json
  tsconfig.json
  README.md
```

## action.yml

```yaml
name: Release Checklist
description: Parses [release: ...] tags from commits and PRs and posts a sign-off checklist on the open Release Please PR
inputs:
  github-token:
    description: GitHub token with PR read/write access
    required: true
    default: ${{ github.token }}
  base-branch:
    description: The branch Release Please targets
    required: false
    default: main
runs:
  using: node20
  main: dist/index.js
```

## Consumer Usage

```yaml
permissions:
  contents: read
  pull-requests: write

concurrency:
  group: release-checklist-${{ github.ref }}
  cancel-in-progress: true

jobs:
  release-please:
    runs-on: ubuntu-latest
    steps:
      - uses: googleapis/release-please-action@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

  release-checklist:
    runs-on: ubuntu-latest
    needs: release-please
    steps:
      - uses: your-org/release-checklist-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

The `permissions` block is required — default `GITHUB_TOKEN` permissions are read-only on many repos and the comment write will 403 without it. The `concurrency` block prevents two near-simultaneous pushes from racing on the comment upsert.

Optionally add `workflow_dispatch:` to the workflow's `on:` triggers so the release manager can manually re-run from the Actions UI if needed without an empty commit.

## Implementation Notes

- Language: TypeScript, compiled to a single `dist/index.js` using `@vercel/ncc`
- Uses `@actions/core` and `@actions/github`
- Comment identification: hidden HTML marker (`<!-- release-checklist-action:marker -->`) so the upsert can find its own previous comment without relying on author or position
- Release Please PR detection: match on open PRs from the `release-please--branches--{base-branch}` branch, with fallback to PRs authored by `release-please[bot]`
- Reverted commits: if commit B has a `Revert "..."` subject referencing commit A's SHA and both are in the range, treat A's tags as withdrawn
- Commit→PR association uses `commits/{sha}/pulls`. For a typical release of <100 commits this is fine; if it becomes a problem, switch to a single GraphQL query

## Tag Parser Notes

- Match is case-insensitive on the `release` keyword
- Single-line only — no multi-line tag bodies
- Skip content inside fenced code blocks (` ``` ` or `~~~`) when scanning PR descriptions
- Nested brackets in tag text are not supported in v1; document this and keep the regex non-greedy on `]`. If users complain, revisit with a proper tokenizer

## Build & Release

- `npm run build` runs `ncc build src/index.ts -o dist` and commits `dist/index.js`
- Tag releases as `v1`, `v1.0.0` etc — consumers pin to `@v1`
- CI lints, builds, runs unit tests (parser + state-merge logic especially), and verifies `dist/` is up to date on every PR

## Out of Scope

- Manifest/monorepo Release Please mode (multiple concurrent release PRs)
- LLM-assisted inference of implicit dependencies from diffs
- Slack/Teams notifications
- Release tooling other than Release Please
- Configurable tag syntax

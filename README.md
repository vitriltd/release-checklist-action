# Release Checklist Action

Aggregates `[release: ...]` tags from commits and PRs into a sign-off checklist posted as a comment on the open [Release Please](https://github.com/googleapis/release-please) PR.

The release manager (and developers prepping ahead of time) tick items off as they go. Checkbox state is preserved across pushes — new tags append at the bottom, ticked items stay ticked.

## Why

On release night, infra/config dependencies from tickets completed weeks earlier get missed. The knowledge exists at PR time but is buried in runbooks and ticket comments by release time. This action surfaces that knowledge directly on the Release Please PR — where the release manager is already looking.

## The convention

In any commit message or PR description body, add one or more inline tags:

```
feat: add supplier invoice webhook [release: add INVOICE_WEBHOOK_SECRET to prod env]
fix: swap redis cache driver [release: update CACHE_DRIVER=redis in all environment configs]
chore: alembic migration [release: run db migrations before deploying]
[release: notify on-call team before releasing - touches payment flow]
```

- Freeform text — describe what someone needs to do, not what the commit changed
- Multiple tags per commit are fine
- Case-insensitive on `release`, single-line only
- Tags inside fenced code blocks in PR descriptions are ignored

## Usage

```yaml
name: CD
on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: write          # Release Please needs write to open/update its PR
  pull-requests: write     # both Release Please and this action write to the PR

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
      - uses: vitriltd/release-checklist-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

The `permissions` block is required — default `GITHUB_TOKEN` permissions are read-only on many repos and the comment write will 403 without it. The `concurrency` block prevents two near-simultaneous pushes from racing on the comment upsert.

`workflow_dispatch:` lets the release manager re-run from the Actions UI without an empty commit.

## Inputs

| Input | Required | Default | Description |
|---|---|---|---|
| `github-token` | yes | `${{ github.token }}` | Token with PR read/write |
| `base-branch` | no | `main` | Branch Release Please targets |

## Output

A living comment on the Release Please PR:

```
## 📋 Release Checklist

The following items were flagged by developers as requiring attention at release time:

- [ ] add INVOICE_WEBHOOK_SECRET to prod env (`a1b2c3d`)
- [x] update CACHE_DRIVER=redis in all environment configs (`d4e5f67`)
- [ ] run db migrations before deploying (`g7h8i90`, `m3n4o56`)
- [ ] re-index docstore after deploy - see migration guide (`j0k1l23`)

_Updated 25 Apr 2026_

<!-- release-checklist-action:marker -->
```

Items linked to multiple commits show all SHAs. Checkboxes are interactive: tick them on the PR as items are completed and that state is preserved across subsequent pushes.

## Scope

v1 targets repos using Release Please in **single-package mode** (one open Release Please PR at a time). Manifest/monorepo mode is explicitly out of scope.

## Behavior details

- **PR detection:** matches the open PR with head ref `release-please--branches--{base-branch}`, with fallback to PRs authored by `release-please[bot]`. If no Release Please PR is open, the action exits silently.
- **Commit range:** reads commits from the Release Please PR's `pulls/{number}/commits` endpoint.
- **PR body scanning:** for each commit, fetches the originating PR (if any) via `commits/{sha}/pulls` and scans its body for tags.
- **Deduplication:** identical tag text from multiple sources collapses to one item with all SHAs cited.
- **Reverts:** `Revert "..."` commits referencing an in-range SHA cause that SHA's tags to be withdrawn.
- **Empty case:** if a previous run had items but the current run has none (e.g. all tags reverted), the comment updates to "No items currently flagged" rather than leaving stale content. If there have never been any items, no comment is posted at all.
- **Tag text edits:** if a developer amends a commit to fix a typo in their tag, the new text counts as a new item and resets to unchecked. Rare; acceptable.
- **Nested brackets:** tags with nested `]` are not supported in v1 — the regex is non-greedy on `]`.

## Development

```bash
npm install
npm test            # vitest
npm run typecheck
npm run lint
npm run build       # ncc → dist/index.js
```

The `dist/` directory is committed. CI verifies it's in sync with `src/` on every PR — if you change source, run `npm run build` and commit the result.

## License

MIT

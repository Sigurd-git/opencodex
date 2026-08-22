# 000 — bug-PR-zero: drive open fix(...) PRs to zero

Snapshot taken 2026-08-23. `gh pr list --state open` returned **48** PRs, of which **12**
have a `fix(...)` title. Those 12 are this program's scope; `feat`/`refactor`/`docs` PRs
are explicitly out of scope.

Order matters: every merge re-bases the snapshot, so each work-phase re-reads
`mergeable` / `mergeStateStatus` for the PR it is about to touch rather than trusting the
table below.

| # | author | title | opening state |
|---|---|---|---|
| 2397 | lidge-jun | gui: sidecar copy collapse + baseline | MERGEABLE |
| 2398 | luvs01 | responses: bound upstream error body reads | MERGEABLE |
| 2395 | luvs01 | usage: bound incremental append reads | MERGEABLE |
| 2390 | luvs01 | auth: map compact substitution failures to 401 | MERGEABLE |
| 2370 | luvs01 | responses: enforce explicit empty tool catalogs | MERGEABLE |
| 2352 | luvs01 | native: start owned lifecycle after ownership reprobe | MERGEABLE |
| 2383 | n3wr1ch | update: recover npm 12 self-updates | MERGEABLE |
| 2368 | ArcSolver | tools: nested apply_patch delimiters in code mode | MERGEABLE |
| 2393 | Ingwannu | zcode: tolerate derived model metadata drift | DRAFT |
| 2375 | agentHits | google: antigravity replay capacity/TTL | DRAFT |
| 2298 | ppvia | claude: warm empty Desktop-3P alias registry | DRAFT |
| 2311 | goodwilliam0126 | grok: translate native edit tools | CONFLICTING |

## Disposition rules

- MERGEABLE + all checks pass + content holds up -> squash merge with `--admin`.
- CONFLICTING -> rebase onto current `dev` locally, push the resolved head, then merge.
  If `dev` already carries an equivalent fix, comment the evidence and close instead.
- DRAFT -> ready-for-review + merge when the work is complete; otherwise close with the
  reason recorded on the PR.

Every merge is verified with `git merge-base --is-ancestor <sha> origin/dev`. A remembered
"it merged" is not evidence.

## Ledger

| # | outcome | evidence |
|---|---|---|
| 2397 | MERGED | squash `5657fac47d1e33763269601c37adcd79cd46978b`, ancestor of `origin/dev` confirmed |


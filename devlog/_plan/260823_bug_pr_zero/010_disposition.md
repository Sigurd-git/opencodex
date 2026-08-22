# 010 — Disposition ledger

Every open `fix(...)` PR in the 2026-08-23 snapshot, and what happened to it.

## Merged (9)

| # | author | squash SHA | note from review |
|---|---|---|---|
| 2397 | lidge-jun | `5657fac47` | gui sidecar collapse + baseline, verified in this session |
| 2390 | luvs01 | `d52032ebe` | compact 500 -> 401; a missing stored credential cannot succeed on retry, so 500 was wrong |
| 2352 | luvs01 | `6036232b9` | lifecycle fence held until owner registration; lab boundary re-verified clean |
| 2395 | luvs01 | `3611850c5` | usage append bounded; caller already handled the `null` fall-back path |
| 2398 | luvs01 | `383279cd2` | error bodies fail closed at 64KiB/5s instead of relaying an attacker-controlled prefix |
| 2370 | luvs01 | `138cbe161` | `tools: []` is now deny-all while omitted `tools` still stands down — protocol-visible, intended |
| 2383 | n3wr1ch | `c8c4178c0` | npm 12 `--allow-scripts=bun`; Windows double-start remains untested |
| 2368 | ArcSolver | `03d576762` | prompt-only delimiter teaching; the parser is untouched, so no mis-parse risk |
| 2393 | Ingwannu | `c9d10ed37` | draft was code-complete with green exact-head CI; marked ready, then merged |

All nine verified with `git merge-base --is-ancestor <sha> origin/dev`. `bun run typecheck`
is green at `origin/dev` = `c9d10ed37`.

## Closed with a reason (3)

| # | author | why |
|---|---|---|
| 2298 | ppvia | **Security.** The warm-up fetches `/v1/models` at `new URL(..., url.origin)` *before* admission and forwards the inbound `Authorization` and `x-api-key`. Bun derives `url.origin` from `Host`, so the destination is caller-controlled; reproduced at `38888e3d` against a capture server. The underlying bug is real and still on `dev` — the fix needs to warm up after admission and reach the registry in-process. |
| 2375 | agentHits | Draft 0/4, 29 commits behind `dev` (past the 10-commit ready gate), no test shards on the fork head, and the title still claims a TTL change that `e830be45` reverted. The 8,192/8 MiB bump itself is correct and wanted back. |
| 2311 | goodwilliam0126 | Semantic conflict with landed #2310: `restoreRoutedCustomCalls`'s third argument is `repairNames: ReadonlySet` on `dev` and a `transform` function here. `core.ts` is "changed in both" with no conflict markers, so an auto-merge silently drops envelope repair or fails typecheck. Needs a combined API, not a rebase. |

Each close carries the full reasoning as a PR comment, including what a mergeable
version would look like. None was closed as "rejected".

## How the calls were made

Four parallel `xai/grok-4.6` review lanes read each diff against the current tree and
returned a per-PR verdict. Two findings changed the outcome:

- the #2298 credential forwarding, which no CI check would have caught
- the #2311 / #2310 API collision, which `mergeable: MERGEABLE` would not have revealed
  because the collision is in a file that auto-merges cleanly and wrongly

One review prediction did **not** hold: #2398 and #2370 were expected to conflict on
`core.ts`. After #2398 landed, GitHub still reported #2370 as `MERGEABLE`, and it merged
without a rebase. Re-reading state after each merge is what caught that, rather than
trusting the opening snapshot.

## Result

`gh pr list --state open` filtered to `^fix` returns **0**.


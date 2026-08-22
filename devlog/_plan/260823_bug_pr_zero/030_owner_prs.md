# 030 — Owner PRs #2396 and #1704, and the regression they surfaced

## #2396 — merged as `4f41a8e93`

`feat(usage): answer today's cost from the CLI in one command`.

The +1826 was not scope creep: ~880 lines are the plan unit, ~540 tests, ~400 product code.
Independent review confirmed `--range today` is a real calendar-day window on server-local
midnight (the same helper `7d`/`30d` already use), pricing goes through the existing
`estimateRequestCost` seam, and the filtered path deliberately bypasses the cache so a
filtered summary can never poison an unfiltered one.

**One real defect was found and fixed before merging** (`5ecc52a8c`):

`dayAttributionCosts` keys by provider/model and stores the SUM of every attempt sharing a
key, while `usageAttributions` yields one entry per attempt. A retry onto the same model
therefore added that pair's total once per attempt, doubling `days[].estimatedCostUsd`
against `summary.estimatedCostUsd`. `buildModels` never had the bug because it adds each
attempt once.

Every existing combo test uses two DIFFERENT models, which is exactly why the bug survived
them. The regression test uses two attempts on the SAME model and fails without the fix.
Fix is `attributionCosts.delete(key)` on read: the first attribution carries the group's
cost, its siblings get zero.

## #1704 — closed

`feat(gui): surface per-target quota state in combo workspace`.

Closed on merit, not on conflict. The single merge conflict
(`combo-workspace-detail-panel.tsx`, where `dev` added `imageInput` to `baselineSyncKey`)
is mechanical and a rebase would resolve it.

The blocking reasons:

- **It does not implement #1702.** The issue asks to DISABLE actions while every target is
  exhausted and re-enable on recovery. The diff adds badges, an attention row, and a
  banner; save and create stay enabled throughout.
- **Exhaustion detection is too narrow.** `exhaustedProvidersFromQuotaReports` only reads
  `creditsUsd.remaining <= 0`, but the `/api/provider-quotas` DTO is mostly percent-based.
  Codex, Anthropic and OpenRouter exhaustion would never badge — the panel looks healthy
  exactly when the combo is dead.
- 1403 commits behind `dev`; `hygiene` red on `missing_regression_test`; no GUI screenshot,
  which `enforce-target` requires.

#1702 was deliberately left OPEN. The full reasoning, including what a landing version
looks like, is on the PR.

## #2404 — the regression #2396 surfaced

Verifying #2396 against a real merge with `dev` failed a test that had nothing to do with
usage. Bisect put the cause on #2398, merged earlier the same day.

| commit | `oversized 400 body never authorizes a pool retry` |
|---|---|
| `3611850c5` (#2395, immediately before) | pass |
| `383279cd2` (#2398) | **fail** |
| `c9d10ed37` (dev head at the time) | **fail** |

**Two contracts collided.** #2398 stopped relaying attacker-controlled error prefixes, so
an oversized upstream body becomes #452's bounded status-only JSON, and it added
`oversized passthrough errors become bounded status-only JSON` to assert that. It left the
pool-retry test asserting the opposite — that the original 65 KiB body returns verbatim.

**Why CI missed it.** Both branches were green on their own heads. The failing test does
not exist on #2398's head; it arrived on `dev` from elsewhere. The test job runs against
the PR head, not the merge result, so two independently-green PRs can land a red `dev`.
That is structural and can recur for any pair touching `src/server/responses/core.ts`.

**Fix (`46d41505c`).** The security intent wins; the stale expectation moves. The invariant
the test exists for is unchanged and still asserted — an oversized 400 does not authorize a
pool retry, so exactly one account dispatches and neither is marked unhealthy. The body
expectation now asserts the hostile suffix never reaches the client.

A first attempt preserved upstream headers through the empty-body branch of
`formatPassthroughUpstreamError`, since that file's doc comment promises "original bytes
and headers". It broke two of #2398's Retry-After tests and was reverted — wrong seam.

## Final state

```
4f41a8e93 feat(usage): answer today's cost from the CLI in one command (#2396)
46d41505c test(codex): follow #2398 on the oversized pool-retry 400 body (#2404)
c9d10ed37 fix(zcode): tolerate derived model metadata drift (#2393)
```

Both merge SHAs verified as `origin/dev` ancestors. `bun run typecheck` green; 146 tests
across the three affected files pass.


# 020 — #2398 regression: pool-retry 400 loses the original response

## What broke

`tests/server-auth.test.ts` → `oversized 400 body never authorizes a pool retry` fails on
current `dev`. `expectOriginal400` asserts the caller still receives the upstream's own
400 — identified by the `x-pool-retry-test: original` header — and instead gets a response
with that header absent.

## Bisect

| commit | result |
|---|---|
| `3611850c5` (#2395, immediately before #2398) | 1 pass, 0 fail |
| `383279cd2` (#2398 merge) | 0 pass, 1 fail |
| `c9d10ed37` (current dev head) | 0 pass, 1 fail |

Recorded in `.codexclaw/evidence/.../test-receipt.json`. #2398 is the cause; the four
commits merged after it are innocent.

## Why CI did not catch it before the merge

#2398's own PR checks were green. The failing test does not exist on that PR's head — it
arrived on `dev` from a different branch. GitHub tests the PR head, not the merge result,
for this job, so an interaction between two independently-green branches lands broken.
That is a real gap, not a fluke: the same shape can recur for any pair of PRs touching
`src/server/responses/core.ts`.

## Mechanism

`shouldRetryCodexPoolAccountModel400` reads the body through `response.clone()`
(`core.ts:792`), so the ORIGINAL body is still unread when the decision is made. Before
#2398 the not-retrying path then called `upstreamResponse.text()` and rebuilt a response
that carried `headers`. #2398 replaced that with `readDisplaySafeErrorText`, which calls
`readBoundedResponseBody(response)` on the original — and on the oversized path returns
`displaySafe: false`, so the caller falls back to a status-only body. The header set that
`expectOriginal400` checks does not survive that fallback.

The security intent of #2398 is right: an attacker-controlled 65 KiB prefix must not be
relayed to the client. The defect is that failing closed on the BODY also dropped the
HEADERS, which are not attacker-controlled in the same way and which the pool-retry
contract depends on.


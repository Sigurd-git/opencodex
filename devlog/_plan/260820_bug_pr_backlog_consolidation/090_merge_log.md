# 090 — Merge log: the bug-PR backlog lands on dev

Unit: 260820_bug_pr_backlog_consolidation
Work-phase: wp21 (merge), authorized by the user with admin override on 2026-08-20.

## What landed

19 PRs, merged into `dev` in dependency order. Six were a stack; the rest were siblings.

| Order | PR | dev merge | Absorbs |
|---|---|---|---|
| 1 | #2134 | `930840ca4` | subagent roster truncation (#2133) |
| 2 | #2160 | — | #2067 @waw4303 |
| 3 | #2162 | `087c3c368` | #2082 @yzxcj797 (#2074) |
| 4 | #2164 | `31750b094` | #2027 @yzxcj797 (#1924) |
| 5 | #2165 | — | #2155 @waw4303 |
| 6 | #2166 | — | #2163 @Ingwannu |
| 7 | #2137 | `be12328bc` | bearer admission (#2132) |
| 8 | #2146 | `aa07bc308` | #2101 @Ingwannu (#2097) |
| 9-19 | #2138, #2140, #2141, #2142, #2144, #2145, #2147, #2148, #2149, #2150, #2151 | see `git log` | siblings |

## The override, narrowed

Every PR sat at CHANGES_REQUESTED from an automated reviewer while its CI was green. A
read-only triage lane read all 19 blocking reviews before anything merged and classified each
objection. That classification is the whole point: an override is only honest if you know what
you are overriding.

- **STALE-BASE / STYLE (13):** overridden. "Head is N commits behind dev" is answered by the
  merge itself.
- **REAL DEFECT (6):** NOT overridden. Fixed on their branches first, each pinned by a
  regression driven RED against the unpatched tree.

## The six real defects

1. **#2142** — `ITEM_ID_PREFIXES` was keyed on `image_gen_call`; the wire type is
   `image_generation_call`, so every real one fell through to the generic `item_`. And the
   malformed-index fallback started at `1_000_000` in the *same numeric namespace* as real
   indexes, so a response reaching index `1_000_001` produced a duplicate id — the one thing
   this backfill exists to prevent. Namespaces are now lexically disjoint.
2. **#2144** — `uninstallShellHook` matched LF-only newlines. A CRLF `.zshrc` was rewritten
   unchanged while the caller was told the hook was removed, so it kept sourcing on every new
   shell. Now matches CR?LF, verifies the marker is gone, and both CLI call sites surface
   `state: "failed"` instead of discarding it.
3. **#2145** — routed-item classification was dropped at `output_item.done`. A trailing
   `function_call_arguments.*` then fell through to the unknown-id branch and reached the
   client as a public frame for an item it was told is a private `tool_search_call`.
4. **#2151** — the absent-`tierDecision` fallback re-derived its own looser answer beside
   `decideTier`, so a provider with `foreignCallerTiers: "drop"` still serialized a caller's
   `flex`. The state machine is now the single authority.
5. **#2166** — `addRequestLog` retained the raw entry in the in-memory ring while only the disk
   projection sanitized. `/api/logs` served the unsanitized value while `usage.jsonl` looked
   clean — the worst shape for a sanitization bug, because the surface you check is the safe one.
6. **Found only by integration** — #2142's id backfill synthesized an id onto the compact
   endpoint's `{type: "compaction"}` wire format, breaking an exact-body assertion. Neither
   branch fails alone. This is the defect that justified the method below.

## Method: build the tree, then merge it

The first plan was to merge each PR and trust its exact-head CI. The audit rejected that, and
it was right: merging a stale head into a moving `dev` creates a tree CI never tested, and each
merge makes the next candidate staler.

So the real merge candidate was constructed locally — all 19 branches merged in order onto the
current `dev` tip — and verified end to end before anything landed. That is what caught defect
6. Per-branch CI would not have.

Verification of the integrated tree (`ssh lidge`, not the workstation):
`typecheck 0`, `privacy:scan 0`, **13714 pass / 15 skip / 0 fail**.

Only devlog files ever conflicted; no code conflict occurred across all 19 merges.

## Issues closed

Ten, each verified present on `dev` by its merge commit rather than assumed: #1886, #1924,
#1950, #2047, #2074, #2092, #2097, #2125, #2132, #2133. These PRs target `dev`, not `main`, so
GitHub does not auto-close; every closure is manual and carries the commit.

## Still open, deliberately

- **#2054** (@keepitmello) — stays open by explicit instruction, carrying the wire-probe request.
- **#2157** — the shadow-helper GUI half is not built; closing it would claim an affordance that
  does not exist.

## Release readiness

`dev` is at `a584890f8`, version line `2.27.0`. This is a readiness record, not a release: no
`scripts/release.ts`, no npm publish, no tag, and `main`/`preview` untouched. Release execution
needs its own authorization.


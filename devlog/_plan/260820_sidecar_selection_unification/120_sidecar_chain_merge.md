# 120 — Sidecar chain merge execution (L1-L9 into dev)

Order: #2203 -> #2204 -> #2206 -> #2209 -> #2211 -> #2238 -> #2242 -> #2243 -> #2245.
Each merge: resolve CHANGES_REQUESTED, obtain maintainer approval, required CI green,
squash-merge into its base, retarget the next child, cascade-verify (typecheck +
focused suites), then proceed. Mid-stream lidge suites are lagging indicators between
pushes; the merge click itself is gated (MAINTAINERS.md).

## Current blocker inventory (fresh, 260821)

- #2203 (L1, CHANGES_REQUESTED Ingwannu): blocker is the tracked cleanup doc
  000_wp0_branch_worktree_cleanup.md — contradictory KEEP/REMOVE entries, no preflight,
  incomplete protected set, b2ac2500c preservation, codex/merge-loop-closeout listed
  both ways. Fix: rewrite the doc as a non-executable historical record (all deletions
  already executed in wp0) with a mechanical protected-set preflight template; or mark
  every command block as executed-snapshot. No runtime code change.
- #2204, #2206 (L2, L3): APPROVED. Rebase-carry only.
- #2209 (L4, CHANGES_REQUESTED): runtime blocker — webSearchModelOptionsFrom drops
  backend provenance; auth-slot model can persist {backend:'openai',
  model:'claude-haiku-4-5'}. Fix: return (backend, model) pairs, validate the pair in
  both PUT routes, teach sidecarBackendForModel the auth-slot rows.
- #2211 (L5, CHANGES_REQUESTED): carry the L4 provenance field through the CLI
  contract — show backend in `web --list` human output and validate pairs on write.
- #2238 (L6, CHANGES_REQUESTED): re-read latest review; fold with the L4 contract.
- #2242 (L7, CHANGES_REQUESTED): re-read latest review; exact-origin pinning already
  fixed; remaining items to fold.
- #2243 (L8, CHANGES_REQUESTED): three runtime blockers per review + red macOS CI
  shard — full RCA in the phase B, fixes + rerun.
- #2245 (L9): reviewer PASS locally; needs maintainer approval; one failing test shard
  reported on CI — reproduce, fix, re-push.

Execution phase: wp9 (with wp8 covering the triage PRs per doc 110 order).

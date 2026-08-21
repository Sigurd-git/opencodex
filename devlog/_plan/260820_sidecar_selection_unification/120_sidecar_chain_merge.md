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
- #2238 (L6, CHANGES_REQUESTED, head a05f23fa9) — three reviewed blockers:
  1. stripOpenAiOnlyWebSearchFields fires for every non-ChatGPT-forward Responses
     provider; official OpenAI API-key traffic loses external_web_access /
     search_context_size. Gate on xAI-specific provider identity/capability and add
     a buildRequest regression proving OpenAI API-key tools retain both fields.
  2. English config reference + CLI help still advertise only the old backend pair;
     document the xai/gemini/exa arms as explicit-only/inert; keep translations
     consistent.
  3. exaApiKey only in SENSITIVE_KEY_PATTERN: add it to the shared colon/query/JSON
     string-redaction grammar with all three canaries in tests/redact.test.ts.
- #2242 (L7, CHANGES_REQUESTED, head 0f2d670c0) — five reviewed blockers:
  1. runXaiWebSearch misses cancelBodyOnAbort after fetchWithResetRetry resolves
     (abort-before-reader race).
  2. parseXaiResponsesSSE must cancel the upstream body at the byte bound, not just
     release the reader lock.
  3. the management PUT mutates config.webSearchSidecar before xSearch validation
     (400 after live state change) — stage and validate the complete candidate first.
  4. malformed xSearch fields are silently omitted — reject invalid handle arrays,
     dates, and enabled values instead of broadening the search with a 200.
  5. public docs + the type comment still call xai inert; update the English source
     and translations. Add no-partial-mutation and oversized-stream regressions.
- #2243 (L8, CHANGES_REQUESTED): three runtime blockers per review + red macOS CI
  shard — full RCA in the phase B, fixes + rerun.
- #2245 (L9): reviewer PASS locally; needs maintainer approval; one failing test shard
  reported on CI — reproduce, fix, re-push.

Execution sequence (explicit — the wp numbers are not the order): wp9 (this doc,
sidecar chain) -> wp8 (triage PRs per doc 110) -> wp11 (doc 130 switch) -> wp10
(docs 140/150).

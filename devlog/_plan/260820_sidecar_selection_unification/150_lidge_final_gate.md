# 150 — lidge final validation gate (blocking)

The one BLOCKING CI/validation point of the train (user directive: mid-stream CI is a
lagging indicator; the final gate is not). At the final dev head:

- lidge: OCX_TEST_NO_QUEUE=1 bun run test — full suite green (baseline 13808+/0 at L9).
- Local: bun run typecheck, bun run privacy:scan, lint:gui (if gui changed).
- GitHub Actions: final dev head green on Linux/Windows/macOS (Windows gate is a
  standing release requirement).
- Live probes through the running proxy: OAuth chat default turn, opt-in Responses
  turn (no caller service_tier upstream), x_search opt-in turn, exa sidecar turn,
  reasoning-streaming E2E (doc 100 matrix).
- Release staged on lidge per release-train conventions; promotion remains
  maintainer-controlled.

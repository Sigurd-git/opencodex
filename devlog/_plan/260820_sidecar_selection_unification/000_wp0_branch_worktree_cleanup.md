# WP0 cleanup plan (session 01a01f4b)
## Protected (never touch): dev, main, preview, open-PR heads (31), dirty worktrees.
## Worktrees to REMOVE (all clean; commit content preserved in dev or by a surviving branch):
/private/tmp/ocx-m2148.LzD2/wt (absorb-baseurl-override, merged)
/private/tmp/opencodex-pr2068.uXcKNC (detached 5a4068bbd, kept by branch pr2068-check, PR2068 OPEN -> branch kept)
tmp.2IOChwQmxR/wp1b + tmp.t3YTdy1JDC/wp1b (detached b2ac2500c, superseded WP1b lineage; merged version a0f8c0135 in dev)
tmp.bxVhqaJyPc/sweeper (tmp-reclaim-1-sweeper, merged)
tmp.bzZ2ssU8WM/wp1b (split-wp1b-type-clusters, merged)
tmp.gLNBuhAyoP (detached d0cd99672, merge of two dev ancestors, nothing unique)
tmp.LfX0NlBXvp/r1876 (ingw/fix-windows-v2-catalog-blocking-1852, merged)
tmp.Mb171xHMCb/r2031 (ingw/fix-mimo-vision-1927, merged)
tmp.pQMnjf3VMg/wp1 (split-wp1-types, merged)
tmp.UFYNSQT3qw/land1920 -> KEEP (DIRTY 2 changes + 3 unique commits)
tmp.vSBe0MZ0LP/w2080 (pr2080, PR merged)
tmp.xfjQ3jxADE/w1934 (pr1934, PR merged)
~/.codex/worktrees/3a35 (devlog-release-2280, merged)
~/.codex/worktrees/3b3b (cursor-call-release-note-2, merged, upstream gone)
~/.codex/worktrees/648b -> KEEP (DIRTY 1 change)
~/.codex/worktrees/71a2 -> KEEP (DIRTY 1 change; branch split-wp2a-config-names stays checked out)
~/.codex/worktrees/83d5 (tmp-reclaim-2-doctor, merged)
~/.codex/worktrees/c6d8 (zcode-client, merged)
~/.codex/worktrees/fe69 (detached 63bfd149d, clean, reachable from many branches)
.tmp/pr-2045-review (b92bb611c; PR2045 merged into dev as 0161a66d9)
.tmp/pr1903-review-8c38989f4 (PR1903 merged; commit kept by remotes/review/pr1903)
## Local branches DELETE - merged into origin/dev (git branch --merged proof):
all 46 merged branches except: dev, split-wp2a-config-names (checked out in kept dirty worktree)
## Local branches DELETE - unmerged but 0 unique patches vs dev (git cherry all '-'):
absorb-account-entitlement-stacked, absorb-capability-evidence, absorb-k12-short-window, absorb-xai-oauth-streaming, consolidate-prompt-cache-retention, fix-bearer-admission-2132, land-1842 (PR closed), land-1876, ocx/integration, ocx/verify-2167
## Local branches KEEP (unique commits or open PR):
combo-quota-badges (PR1704 OPEN), compat-multiagent-v2-catalog (4u), devlog-merge-log (1u), devlog-three-issues (PR2181 OPEN), external-vision (1u), issue-quality-provider-defect-bug-label (1u), land-1920 (3u+dirty wt), cursor-call-prerebase-260818 (2u), ocx-dev-verify (1u), ocx/rebuild-2178 (1u), wip/* (unique), pr2053-check (2u), pr2056-check (1u), pr2068-check (PR OPEN), pr2072-check (PR OPEN), pr2101-probe (5u), pr2105tmp (3u), main, preview, dev
## Remote branches DELETE (origin, merged into origin/dev, not an open-PR head): 37 listed in remote_deletable
## Remote branches DELETE (unmerged, 0 unique, PR closed/merged): codex/absorb-account-entitlement-stacked, codex/absorb-capability-evidence, codex/absorb-k12-short-window, codex/absorb-xai-oauth-streaming, codex/consolidate-prompt-cache-retention, codex/fix-bearer-admission-2132, codex/land-1842, codex/land-1876


## AMENDMENT 1 (post-audit synthesis, auditor Goodall VERDICT: fail)
- BLOCKER FIX: before removing tmp.2IOChwQmxR/wp1b and tmp.t3YTdy1JDC/wp1b, create preservation branch wip/wp1b-superseded-b2ac2500c at b2ac2500c (unique cherry patches, no surviving ref). Superseded by a0f8c0135 in dev but preserved per no-data-loss rule.
- FIX: add /Users/jun/.codex/worktrees/land-1842/opencodex to worktree REMOVE list (clean, PR #1842 CLOSED, 0 unique patches) so codex/land-1842 branch delete can proceed.
- FIX: codex/merge-loop-closeout => KEEP (2 unique local commits).
- DOC FIX: the 37 remote deletable branches are exactly:
codex/absorb-agentrouter-language-framing
codex/absorb-antigravity-thought-signatures
codex/absorb-baseurl-override
codex/absorb-claude-shell-hook-gate
codex/absorb-fastwire-native-chat
codex/absorb-oauth-superseded-commit
codex/absorb-openai-chat-padding-repeats
codex/absorb-opencode-free-static-headers
codex/absorb-opencode-go-quota-siblings
codex/absorb-responses-id-backfill
codex/absorb-shadow-helper-attribution
codex/absorb-tool-search-passthrough
codex/audit-closeout
codex/audit-record
codex/audit-shadow-marker-leak
codex/audit-tool-search-id
codex/devlog-audit
codex/devlog-release-2280
codex/fix-admission-bearer-transport
codex/fix-audit-record-scan
codex/fix-privacy-scan-devlog
codex/fix-subagent-roster-truncation
codex/fix-windows-ci-shards
codex/harden-core-lab-guard
codex/logs-intercepted-helper-attribution
codex/merge-loop-closeout
codex/merge-loop-outcome
codex/openai-chat-tool-call-heartbeat
codex/promote-2.28.0
codex/split-wp1-types
codex/split-wp1b-type-clusters
codex/split-wp2a-config-names
codex/sync-preview-2.28.0
codex/windows-shard-truncation-and-budgets
ingw/docs-tool-search-troubleshooting-1872
ingw/fix-mimo-vision-1927
ingw/fix-windows-v2-catalog-blocking-1852


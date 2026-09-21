---
name: issue-filing
description: File, triage or relabel a GitHub issue in a Shopify app repo that runs on the kit's operating model: one work-type label from the executor ladder, one priority, one ROI bucket, a "Close condition needs" block, bootstraps that name where a value goes and what they unlock, decisions with options, irreversible work routed to a human. Use when filing, triaging or relabelling a GitHub issue, splitting an issue whose close condition spans executors, writing a Bootstrap or decision issue, or when a CI workflow or routine opens issues.
allowed-tools: Read, Grep, Glob, Bash(gh issue *), Bash(gh label *), Bash(gh api *), Bash(jq *), Bash(cat *), Bash(git remote *)
---

# shopify-app-kit issue-filing

GitHub issues are the only work queue: agents and humans read the same list and nothing writes to a project
board. An issue is workable only when its labels say who can close it and its body says what closing needs.
The ten rules are in `references/rules.md`; what each executor rung can and cannot do, and when a rung is
live, is in `references/executor-ladder.md`.

## Steps

1. **Read the label set.** `${CLAUDE_PROJECT_DIR}/.github/labels.json` when the repo keeps its own copy, else
   `${CLAUDE_PLUGIN_ROOT}/labels.json`. Its `ladder` array is the executor order (least privileged first);
   `human:bootstrap` sits alongside `human:account`. Never invent a label; a missing one is created with
   `node ${CLAUDE_PLUGIN_ROOT}/scripts/sync-labels.mjs` (never by hand, never deleting).
2. **Read the repo facts** from `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json`: `branches.default` (the only
   PR target), `deploy.protectedWorkflows` (never dispatched by an agent), `billing.live` and `app.kind` (they
   decide whether a line is irreversible, rule R6).
3. **Write the body from the work-item template** (`.github/ISSUE_TEMPLATE/work-item.md`): "What", the "Close
   condition needs" block with exactly one group ticked, the irreversibility check, "Notes". An issue with no
   ticked line cannot be labelled (R2). A `Bootstrap:` issue follows R4: `Bootstrap: <what> → <where>`, the
   sensitivity class, the expiry, `Unlocks: #a #b`; never the value itself (R10).
4. **Decompose before labelling** (R3). Lines from more than one executor → split now: the human-only line is
   its own issue; the agent-doable remainder keeps the number, gains `blocked` and says "after #N" in the body.
5. **Apply the ladder** (R1) and the overrides: irreversibility beats the ladder (R6: real money, a production
   data write outside a guarded script, a one-way platform choice, uninstalling a legacy app, brand or legal
   text, any 2FA or payout step → `human:decision` or `human:account`, whatever a CLI could do); a decision
   with no options comment gets one, or the filer takes the reversible default and labels `code only` (R5).
6. **Score in the same pass** (R8): one priority (`p1` gates a real install or protects money or data; `p2`
   unblocked and planned; `p3` deploy, blocked or nice-to-have), one ROI bucket (`roi:5` … `roi:1`, value ÷
   effort; a bootstrap's value is the max of its Unlocks, its effort the maintainer's minutes), plus
   `launch-gate`, `blocked` or `deploy` when they apply, and a row in the ranking doc when the repo keeps one.
7. **Relabelling a `human:*` issue** (R7): an agent never closes it and never moves it to `agent:*` or
   `code only`, except on a comment beginning `decision:` or when a closed `Bootstrap:` lists it under Unlocks;
   then remove `blocked` from its children and comment "unblocked by #N".
8. **Filing from CI or a routine** (R9): search open issues for the same title prefix first and comment on the
   match; a new one carries `bug` + `p1` + the executor label and never attaches traces or test results.
9. **The one exemption:** the pinned "maintainer's queue" issue is a tracking surface the triage routine
   rewrites; it carries no work type, priority or ROI and the lint skips it (`references/rules.md`).
10. **Report** the number, the three labels, the executor line it ticked, and every issue it split or unblocked.

## References

- `references/rules.md`: the ten filing rules and the queue exemption, each with the failure it prevents.
- `references/executor-ladder.md`: what each rung can and cannot do, the readiness table, substitution upward.

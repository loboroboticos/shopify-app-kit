# The executor ladder

Every issue carries exactly one work-type label, and the label is the executor: the least-privileged party
that can close the issue once its linked bootstraps are closed. The order lives in `labels.json`'s `ladder`
array so the skill and the routines read it rather than restate it.

## The rungs

| Rung | Can | Cannot |
| --- | --- | --- |
| `code only` | Open a PR to `branches.default` with code, config, docs or tests; the PR closes the issue. | Reach the store, a dashboard, a secret or a workflow run. |
| `agent:ci` | Add, edit or dispatch a GitHub Actions workflow that uses the repo's existing secrets (a QA run, an audit, a migration rehearsal). | Create a secret, dispatch a workflow named in `deploy.protectedWorkflows`, log in anywhere. |
| `agent:cloud` | A cloud session that reaches the store or the app itself over its API with credentials the environment already holds (a probe, a data read, a webhook replay). | Use a login, a browser session or a maintainer-only file. |
| `agent:local` | A Claude Code CLI session on the maintainer's machine: logged-in `shopify`, `gh` and hosting CLIs, `.env`, a browser. | Anything a human must do by hand (2FA, payment, a dashboard-only toggle). |
| `human:bootstrap` | A one-time maintainer action (a secret set, a registration linked, a role created) after which the issues under Unlocks are agent work. | Be done by an agent, even when a CLI exists. |
| `human:decision` | A product, architecture or art-direction choice, answered by a comment beginning `decision:`. | Be closed by an agent; be relabelled without the `decision:` comment. |
| `human:account` | Account, identity, payment, payout, tax, 2FA or dashboard-only work with no API. | Be closed by an agent. |
| `human:legal` | Legal, compliance, trademark, DPA, third-party review. | Be closed by an agent. |

## Readiness

A rung is live only once the bootstrap that equips it has closed: `agent:ci` is live when the workflow's secrets
exist, `agent:cloud` when the environment holds the store credentials, `agent:local` when the maintainer's
machine has the CLIs logged in. The triage routine keeps a readiness table in the pinned queue issue, one row
per rung with the bootstrap that flips it and its state; an issue labelled for a rung that is not yet live also
carries `blocked` with "after #B" naming that bootstrap. Filing for a dead rung is correct; starting on it is not.

## A higher rung may always substitute

A higher rung can do everything a lower one can: `agent:local` may close a `code only` issue, a human may close
any agent issue. The label names the minimum, not the assignee. The reverse never holds, and the ladder never
climbs on its own: an agent picks up an issue only at or below its own rung, and a `human:*` label moves down
only through a `decision:` comment or a closed bootstrap that lists the issue under Unlocks.

Sources: app-1 (ops doc: the ladder and its readiness); app-2 (contributor guide: what a session may do on its own); app-3 (rebuild plan: the bootstraps a multi-tenant app needs before its first install).

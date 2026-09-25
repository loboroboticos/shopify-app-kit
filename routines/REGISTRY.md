# Routines

Scheduled Claude Code Routines are the workforce of the operating model: each one is a fresh cloud session
fired on a cron with one of the prompts in this directory. The prompt texts are committed here and
parameterised by the consumer's `.claude/shopify-app.json` and `labels.json`; the triggers themselves are
created per repo by the maintainer (the step at the end). `test/routines.test.mjs` keeps every file in the
shape below and every routine in this table.

## The shared preamble

Every prompt starts the same way, and the header of every routine file repeats it: read
`.claude/shopify-app.json` (`branches.default`, `branches.protected`, `deploy.protectedWorkflows`) and
`labels.json` (the consumer's `.github/labels.json`, else the kit's); derive the repository from the git
remote, so no prompt names one; a routine never closes a `human:*` issue and never relabels `human:*` to
`agent:*` except per R7 of the `issue-filing` skill; never dispatches a workflow named in
`deploy.protectedWorkflows`; opens at most one PR per run, to `branches.default`; and never lets a secret into
an issue, a comment or a PR.

## The routines

| Routine | Cadence (cron, UTC) | Environment | Tools it needs | May touch |
| --- | --- | --- | --- | --- |
| `triage.md` | weekly, `33 6 * * 1` | fresh cloud session, GitHub MCP tools, Read on the checkout | issues, labels, comments, workflow runs and dispatch, one PR | labels and `blocked`, comments, the pinned queue issue's body, one PR touching only the ranking doc |
| `nuclear-review.md` | weekly, `47 5 * * 2` (monthly: the whole default branch) | fresh cloud session with the checkout and the kit plugin | git (read), `/shopify-app-kit:review`, issues | new issues, comments, one comment on the queue issue |
| `pr-steward.md` | daily, `19 7 * * *` | fresh cloud session with the checkout and push access to PR head branches | git, the repo's checks, PRs, check runs, job logs, review threads | head branches of agent-owned PRs, their review threads |
| `kit-health.md` | monthly, `23 6 3 * *`, once per repo | fresh cloud session with the checkout, the kit and the Shopify companion | `doctor`, `git ls-remote --tags` on the kit repo, the companion's docs search, `portfolio.json`, issues | new issues, comments |
| `graphify-refresh.md` | weekly, `11 4 * * 0` | fresh cloud session with the checkout, graphify installed, push to `graph/` | git, the `graphify` skill | the `graph/` branch only |
| `dependency-wave.md` | weekly, `53 6 * * 3` | fresh cloud session with the checkout and the GitHub MCP tools | `npm audit` / `pnpm audit`, `dependabot.yml`, issues | one `dependencies` + `agent:ci` issue |
| `dev-parity.md` | weekly, `43 6 * * 4`; only where the manifest has a `beta` deploy target and a dev CLI config | fresh cloud session with the checkout and the GitHub MCP tools, egress to the beta and prod hosts | the repo's tripwire tests, git and diff (read), workflow runs (read), issues, an HTTPS GET on each health endpoint | new issues, comments, one monthly comment on the parity issue |

Cron minutes are off the hour and distinct across routines (and from the consumer's own scheduled workflows),
so the fired sessions never queue behind each other.

## Which routines a product runs

`portfolio.json` at the kit root lists every product with the routines it runs (`routines: ["triage", ...]`).
Cross-repo routines (`kit-health`'s portfolio step) iterate it; `new-app`'s checklist appends the new product.
`dev-parity` is not on the placeholder roster: it runs only for a product with a dev registration and a hosted
beta, and is added to that product's `routines` by hand.

## The maintainer's step: creating a trigger

One trigger per routine per repo, created from a session that runs in that repo's environment, with the
`create_trigger` tool of the remote-session MCP server (the same tool `send_later` wraps):

```
create_trigger(
  name: "<repo short name>: <routine>",
  cron_expression: "<the cron from the table>",
  create_new_session_on_fire: true,
  initiation: "human_request",
  prompt: "<the text under ## Prompt of routines/<routine>.md, pasted verbatim>"
)
```

`create_new_session_on_fire: true` is what makes each run a fresh session in the repo's environment; the prompt
must therefore be complete on its own, which is why every routine file repeats the ground rules instead of
pointing at this page. The environment the trigger inherits is the session's; check it is the one
`portfolio.json` names for the product. `list_triggers` shows the last run of each; a routine whose last run
is `FAILED` twice is disabled and its prompt fixed here first, then `update_trigger` carries the new text.

## Adding a routine

`skills/kit-dev/SKILL.md`, "Add a routine": one file per routine with the five header fields, a `## Prompt`
section written for a fresh session, a row here, and the test.

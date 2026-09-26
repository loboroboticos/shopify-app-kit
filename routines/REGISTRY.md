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
an issue, a comment or a PR. `kit-tidy`, the one routine that runs on the kit itself, has no manifest to read; its
ground rules are the same minus the manifest keys, and its one PR goes to `main`.

## The routines

| Routine | Cadence (cron, UTC) | Environment | Tools it needs | May touch |
| --- | --- | --- | --- | --- |
| `triage.md` | weekly, `33 6 * * 1` | fresh cloud session, GitHub MCP tools, Read on the checkout | issues, labels, comments, workflow runs and dispatch, one PR | labels and `blocked`, comments, the pinned queue issue's body, one PR touching only the ranking doc |
| `nuclear-review.md` | weekly, `47 5 * * 2` (monthly: the whole default branch) | fresh cloud session with the checkout and the kit plugin | git (read), `/shopify-app-kit:review`, issues | new issues, comments, one comment on the queue issue |
| `pr-steward.md` | daily, `19 7 * * *` | fresh cloud session with the checkout and push access to PR head branches | git, the repo's checks, PRs, check runs, job logs, review threads | head branches of agent-owned PRs, their review threads |
| `kit-health.md` | monthly, `23 6 3 * *`, once per repo | fresh cloud session with the checkout, the kit and the Shopify companion | `doctor`, `git ls-remote --tags` on the kit repo, the companion's docs search, the discovered portfolio, issues | new issues, comments |
| `graphify-refresh.md` | weekly, `11 4 * * 0` | fresh cloud session with the checkout, graphify installed, push to `graph/` | git, the `graphify` skill | the `graph/` branch only |
| `dependency-wave.md` | weekly, `53 6 * * 3` | fresh cloud session with the checkout and the GitHub MCP tools | `npm audit` / `pnpm audit`, `dependabot.yml`, issues | one `dependencies` + `agent:ci` issue |
| `kit-tidy.md` | weekly, `37 5 * * 5`; in the kit repository only | fresh cloud session in the kit's environment with the checkout, `node`, the `claude` CLI and the GitHub MCP tools | `npm test`, the validate commands, git (read plus one branch), `test/budget.json`, the discovered portfolio, issues | new `kit-tidy:` issues, comments, one PR of mechanical drift to `main` |
| `dev-parity.md` | weekly, `43 6 * * 4`; only where the manifest has a `beta` deploy target and a dev CLI config | fresh cloud session with the checkout and the GitHub MCP tools, egress to the beta and prod hosts | the repo's tripwire tests, git and diff (read), workflow runs (read), issues, an HTTPS GET on each health endpoint | new issues, comments, one monthly comment on the parity issue |

Cron minutes are off the hour and distinct across routines (and from the consumer's own scheduled workflows),
so the fired sessions never queue behind each other.

## Discovering the portfolio

The kit keeps no register of products: a public file could hold only private facts. Each consumer's manifest
declares `kit.portfolioId` (an opaque id, never a business, product or store name) and `kit.routines` (the
routines it runs, by file name). A cross-repo routine discovers the portfolio at run time: it lists the
repositories under the git remote's owner that its session can read, fetches `.claude/shopify-app.json` from each
one's default branch, keeps those carrying `kit.portfolioId`, and refers to a product by that id only. A consumer
the session cannot read is not in the portfolio for that run, and the summary says how many were found.
`new-app`'s checklist sets both keys; `dev-parity` is listed only by a product with a dev registration and a
hosted beta; `kit-tidy` runs in the kit repository and is nobody's roster entry.

## The maintainer's step: creating a routine

One routine per prompt per repo, made on the claude.ai routines page (`claude.ai/code/routines`, **New
routine**) and never from inside a session: the `create_trigger` tool a session holds (the one `send_later`
wraps) takes no repository, so the session it fires has no checkout and goes idle within a minute having
written nothing. That tool wakes an existing session, a check-in; it cannot run a routine. `/schedule` in a
local CLI writes the same routine and is refused inside a cloud session.

1. **The environment**, only when **Default** is not enough. Default reaches the package registries and GitHub
   through the proxies, Node is on PATH and the session is the `claude` CLI, which covers every routine but
   `dev-parity` (its health GETs need the beta and prod hosts under **Custom** network access). Environments are
   made from the cloud icon above the message box at `claude.ai/code` (**Add cloud environment**); one holds
   network access, variables and a setup script, never a repository.
2. **The form.** Name `<repo short name>: <routine>`; the prompt is the text under `## Prompt` of
   `routines/<routine>.md`, pasted verbatim (`dev-parity`'s repo preamble above it); exactly one repository, the
   consumer's (the kit's for `kit-tidy`), because a session with several loads no `.claude/settings.json` and
   the bootstrap hook that installs the kit does not run; a **Schedule** trigger at the nearest preset, then
   the cron from the table (UTC) set with `/schedule update` from a local CLI; under **Connectors**, only what
   the routine's Tools field needs.
3. **The first run by hand.** **Run now** on the routine's page, then read the run's session before trusting
   the schedule: a run idle within a minute that wrote nothing has no checkout, and a green row in the run list
   means only that the session exited without an infrastructure error.

Each run is a new session with the repository cloned at its default branch, which is why every prompt is
complete on its own and repeats the ground rules instead of pointing at this page. A routine whose run does
nothing twice is paused with the switch on its page and its prompt fixed here first, then pasted again with
**Edit**. Commits, PRs and comments a routine makes carry the maintainer's GitHub identity.

## Adding a routine

`skills/kit-dev/SKILL.md`, "Add a routine": one file per routine with the five header fields, a `## Prompt`
section written for a fresh session, a row here, and the test.

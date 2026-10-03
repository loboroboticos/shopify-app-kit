# Routines

Scheduled Claude Code Routines are the workforce of the operating model: each one is a fresh cloud session
fired on a cron with one of the prompts in this directory, parameterised by the consumer's
`.claude/shopify-app.json` and `labels.json`. The maintainer creates them per repo (the step at the end); adding
a routine is `kit-dev`'s "Add a routine", and `test/routines.test.mjs` keeps every file and this table in shape.

## The shared preamble

Every prompt opens with the same ground rules, repeated in each file because each is pasted standalone: it reads
the manifest and `labels.json` and derives the repository from the git remote, and a routine
never closes a `human:*` issue, never dispatches a protected workflow, opens at most one PR per run and lets no
secret into any text. The prompts are the source; `kit-tidy` keeps the same rules minus the manifest keys.

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
routines it runs, by file name). A routine's session reads only the one repository it was made with, so a
cross-repo routine discovers the portfolio at run time: it lists the repositories the account can read
(`list_repos`), whatever the owner, attaches each read-only (`add_repo` with read access), fetches
`.claude/shopify-app.json` from each one's default branch, keeps those carrying `kit.portfolioId`, and refers to a
product by that id only. A consumer it cannot attach is not in the portfolio for that run, and the summary says
how many were found.
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
   `routines/<routine>.md`, pasted whole (`dev-parity`'s repo preamble above it); exactly one repository, the
   consumer's (the kit's for `kit-tidy`), because a session with several loads no `.claude/settings.json` and
   the bootstrap hook that installs the kit does not run; a **Schedule** trigger at the nearest preset, then
   the cron from the table (UTC) set with `/schedule update` from a local CLI; under **Connectors**, only what
   the routine's Tools field needs.
3. **The first run by hand.** **Run now** on the routine's page, then read the run's session before trusting
   the schedule: a run idle within a minute that wrote nothing has no checkout, and a green row in the run list
   means only that the session exited without an infrastructure error.

Each run clones the repository at its default branch. The page stores the words and drops the markdown (backticks,
list numbers, line breaks), so check a stored prompt against its file word for word, not byte for byte. A routine
whose run does nothing twice is paused with the switch on its page and its prompt fixed here first, then pasted
again with **Edit**. Its commits, PRs and comments carry the maintainer's GitHub identity.

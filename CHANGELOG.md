# Changelog

All notable changes to shopify-app-kit. The version is the plugin version in `.claude-plugin/plugin.json`; every
vendored hook carries it on line 2 (`# shopify-app-kit vX.Y.Z`). A version that deprecates something lists it under
`### Deprecated`; the next minor deletes it and lists it under `### Removed` (`kit-dev`: "Remove a skill, agent,
hook, workflow or routine"). Sections up to 0.9.0 are compacted; `git log -p CHANGELOG.md` has their full text.

## 0.20.0

The Built for Shopify gates (#165): what a consumer's admin, storefront output, auth and release must show before
an App Store submission, as review lenses, a tripwire pattern, a release-readiness dimension and scaffold edits.
Platform facts stay with the companion plugin; the kit links the requirements page and names what to check.

- `lessons/INDEX.md` and `test/lessons-index.test.mjs` retired (#144): nothing cited a row; the lessons are text in
  their references, `lessons/README.md` keeps the discipline and the source labels. 0.7.0 to 0.9.0 here compacted.
- Review lenses. `review-correctness`: every document in the admin iframe, error boundaries and bounce landings
  included, carries the package's App Bridge shell once, first, with an API key (app-1's layout ErrorBoundary served
  one without); no login between install and first use; storefront output only through a theme app extension, a
  ScriptTag, theme write or paste-into-theme copy P0 without an exemption ADR; `auth.expiringOfflineTokens` equals
  the server flag. `qa-review-usability` walks the admin against the design requirements through the companion's
  `shopify-polaris-app-home` and lists what a diff shows (app-1's modal actions outside the slots, toast-only
  errors); `design-review-product-intent` names surfaces outside the admin and category exposure (app-2's worker
  surface); `qa-review-technical-integrity` an embedded route's first paint; `review-quality` the shell and Polaris
  web components only; `storefront-extension-reviewer` check 4 is asset size, loading and page scope and points at
  `storefront-qa`, whose performance budget defers its numbers to the requirements page and gains a clean-uninstall
  smoke (#129); `billing-live-posture`: a plan-gated control is disabled and refused from one entitlement read.
- `tripwire-patterns`: "Embedded document conformance" (every own-`<html>` or out-of-layout route renders
  `AppProvider` or sits in a shrinking allowlist, no App Bridge v3 dependency, one `rel="home"` nav link with
  resolving hrefs and no nesting, and the static UI checks a consumer owns); the manifest tripwire refuses
  theme-write and script-tag scopes and checks the production name and one scope source; the default-deny audit
  checks the `frame-ancestors` header. Neighbouring prose tightened to pay for it.
- `release-readiness`: `app-store-review` is a real dimension for a public app (`app.kind` is not `custom-app`,
  replacing the README/toml heuristic and the `appPublic` scope field), `review-correctness`'s Auth boundaries and
  Scopes checks over the whole checkout; the note special case is gone. Its checklist line asks for the companion
  summary (or "companion not installed") and the design walk on desktop and in the Shopify mobile app.
- `expiring-tokens`: "Migrating existing installs" (a row without a refresh token is pre-flag; a guarded one-shot
  exchange with `expiring=1` and a dry run, the production run `human:decision`, done when no active shop lacks a
  refresh token; app-1 may hold pre-flag tokens). The platform dates and lifetimes leave the kit (`new-app`, the
  schema's `auth.expiringOfflineTokens`, the README, `prisma-migration-reviewer`): the companion's `shopify-dev`.
- `new-app`'s overlay removes the template's demo leftovers app-2 shipped (the "Additional page" link and route,
  the Inter stylesheet, the index route's shop-domain form, now a redirect to `/app`) and marks Home `rel="home"`.
  Templates: seeds 3, 11 and 12 ask about theme writes, tier gating and the listing category; the billing rule
  seed drops its distribution restatement.

### Budget

- `test/` 3815 -> 3750 (#161's `test/` remainder), `lessons/` 200 -> 45. `hooks/` stays 1950 (#161).

## 0.19.2

The cache age a block names (`fetched N s ago`) is never negative: a stamp ahead of `kit_origin_load`'s clock (the
fetch's own clock read fell on the next second, or skew) counts as 0 s old; the test pins it. Nothing else changes.

## 0.19.1

The ratchet-down after 0.19.0's raise (#161), and the D6 residual recorded rather than built (#162).

- `guard-protected-branch`: a block says `Protections checked: ...` only when origin's copy differs from this checkout
  on a guard-read key (named) or origin was not read cleanly (stale, absent, none); a plain block stays short.
- `guard-shopify-cli` reads this checkout's policies only, by decision: a checkout that predates a stricter `shopifyCli`
  policy enforces the older one until its manifest is updated from `origin/<default>`; the doctor reports the difference
  at session start, the drift notice after the next guarded `git` or `gh` call (its header, the README row).
- Comments shortened and two folds in `hooks/`; near-duplicate test rows tabled (the same generated cases, dumped and
  compared) and the remote-tracking fallback tested; the 0.1.0-0.6.0 sections here compacted, which `release.md` now
  allows (`personas.md` and the README carry the port rules the 0.5.0 section held). Behaviour otherwise unchanged.

### Budget

- `test/` 3830 -> 3815, `CHANGELOG.md` 1090 -> 950; `hooks/` stays 1950: the comment cuts meant to pay for a drop were
  line joins. `raisedIn` stays 0.19.0 while `hooks/` and `test/` sit above their 0.18.1 ceilings (1830, 3750), #161's
  remainder. Kept on purpose: the lock's dead-pid check (age alone: 6 s a call for 20 s after a killed hook), `absent`
  apart from `none` (else a 30 s retry with wrong advice), the drift notice and the remote-tracking fallback.

## 0.19.0

A stale checkout is held to the default branch's manifest (app-1: a newly protected workflow was dispatchable).

- `guard-protected-branch`: `branches.protected` and `deploy.protectedWorkflows` are the union of this checkout's
  and origin's default-branch manifest, read on the first guarded verb into a bare repo under `.git/kit/` (`--depth=1`,
  never into the clone), cached 120 s, each step bounded to 6 s; display names come from origin's copy too. A
  protection origin removed stays until the checkout updates, and every block names what it checked. Origin never
  reached, no copy: dispatch, rerun, cancel and merge block, a push passes. Bindings and the `shopifyCli` policies
  stay local; a fetch that finds origin's manifest different sends a drift notice (PreToolUse `additionalContext`)
  and the doctor prints `Drift:`. Residual: a clone whose git auth lives only in its own `.git/config` falls back
  to `refs/remotes/origin/<default>`. Blocks say "a protected workflow", not "a production deploy".
- Every guard registration (the `sync` snippet, the settings template) sets `"onFailure": "block"` (Claude Code
  2.1.295+), so a guard that times out or crashes blocks; the doctor reports one without it.

### Budget

- Temporary raise, approved by the maintainer for app-1's stale-checkout incident: `hooks/` 1830 -> 1950, `test/`
  3750 -> 3830, `CHANGELOG.md` 1075 -> 1090. A ratchet-down follow-up is owed.

## 0.18.1

Fixes from the review of 0.18.0.

- `guard-protected-branch`: a value attached to its field flag (`-fbase=main`, `-fref=refs/heads/main`,
  `-Fbranch=main`) is checked like a spaced one; 0.18.0's note that the ref and contents checks caught `-fsha=` held
  for the write, not for an attached value (#147).
- `guard-protected-branch`: the method is the last `-X` / `--method`, also inside a short-flag cluster (`-iX PUT`),
  and a field flag in a cluster (`-if`) means POST; `-X GET` with fields stays a read. This decides the auto-merge
  route and every write check (#148).
- `guard-protected-branch`: the head lookup sends `state` and `head` as fields, so gh encodes a `#` or `+` in a
  branch name, and a `null` base (or two open PRs with that head) is unresolved, never unprotected (#149).
- `test/hooks.test.mjs`: the fake `gh` applies the real `--jq` filter to canned JSON; new cases for MCP
  `enable_pr_auto_merge` and the auto-merge route on the GraphQL-403 path, the `'#12'`, `-R o/r 12`, `o:feat`,
  `feat/x` and bare-branch selectors, and `automerged-thing` / `auto_merged` / `-X GET … -f` as non-merges (#151).
- `templates/server/scripts/assert-dev-db.mjs`: the check runs when invoked through a symlink (it exited 0 without
  checking); its suite spawns the CLI for exit 0, 1 and 2 and through a link (#146).
- `templates/.claude/hooks/kit-bootstrap.sh`: an installed kit is refreshed (`claude plugin marketplace update`,
  then `claude plugin update -y`) with one line naming the version before and after; a cloud home that carries an
  old plugin cache no longer pins every session to it (#154).
- `test/routines.test.mjs` also rejects `Closes: #N` and `owner/repo#N`; the workflows' `@shared models` block
  takes only own role names and string values (tested); the doctor's graphify test no longer sees a real
  `graphify` on PATH (#153).
- Stale text from 0.18.0's docs and ROI rules: the docs-2 lesson, `tripwire-patterns.md`, triage step 1,
  issue-filing step 6 and R8, the `labels.json` comment, and the ADR's doctor claim and decision list (#152).

### Budget

`hooks/` 1800 → 1830, `templates/` 1230 → 1285, `test/` 3690 → 3750 and `CHANGELOG.md` 1040 → 1075 for the fixes the
0.18.0 review found, their cases, and this section (#150).

## 0.18.0

The first consumer's K1 fixes: merges resolve their base in a cloud session, the auto-merge route is guarded, every
workflow agent names its model, and the templates, lessons and routine prompts stop stating things that are false.

- `guard-protected-branch`: when `gh pr view` fails (a cloud session's proxy refuses GraphQL with a 403, so every
  merge was refused), `pr_base` resolves the base through REST for all three callers (`gh pr merge`, `gh api
  …/pulls/<n>/merge`, the MCP `merge_pull_request` / `enable_pr_auto_merge`): a number or a PR URL through
  `pulls/<n>`, a branch or no selector through the one open PR with that head, on `-R` or the checkout's repository.
  Anything still unresolved is refused, as before (#134).
- `guard-protected-branch`: a `PUT`, `POST` or `PATCH` to `pulls/<n>/…auto_merge` (a proxy-provided REST route that
  enables auto-merge) is a merge of PR n: blocked into a protected base and when the base cannot be resolved; a read
  or a `DELETE` passes. A field flag written without a space (`-fsha=…`, `--field=k=v`) now counts as a write here
  and for the ref and contents checks; a value attached to it (`-fbase=main`) was still missed, fixed in 0.18.1 (#134).
- `pre-pr-review`, `release-readiness`, `plan-review`: every `agent()` names its model by role (`@shared models`):
  `judgment` (`opus`) for the four `design-review-*` agents, `qa-review-divergence-hunter` and
  `qa-review-security-governance`; `scope` (`haiku`, `sonnet` in plan-review); `reviewer` and `skeptic` (`sonnet`).
  `args.models` overrides any role (#135).
- `dist-2` (`admin-api`'s `distribution-is-one-way.md`), the billing rule seed, the schema's `billing.method` and the
  ADR seed: a custom-distribution app cannot bill through Shopify at all; a public app uses the Billing API or App
  Pricing (#136).
- `triage`, `pr-steward`, `nuclear-review`, `dependency-wave`, `kit-health`, `graphify-refresh`: refer to issues as a
  plain `#N`, never with a closing keyword before it, whatever the sentence's subject; `test/routines.test.mjs`
  holds every routine to it (#137).
- `templates/server/scripts/assert-dev-db.mjs` and its `node --test` suite: the dev-database guard the templates
  described but never shipped, pinning the whole `DATABASE_URL` (sha256, 8 hex) because a dev project can share
  production's host and database name. `new-app` writes `server/` templates to the server directory and lists the
  dev-command prefix as a todo; `.env.example`, the prisma rule seed and CLAUDE.md carry the corrected recipe (#138).
- `templates/.claude/hooks/kit-bootstrap.sh`: `-y`, the exact plugin id, the bare-name companion fallback for cloud
  containers, one success or failure line per install (#139).
- `docs/adr/0001-first-consumer-design-snapshot.md`: the first consumer's design sections (hooks, operating model,
  the 2026-09-20 web check, decisions), generalised, in a new kit-root `docs/adr/` (#140).
- `docs-owner` step 3, `single-owner.md` and the docs templates: superseded text is deleted in the PR that
  supersedes it; `docs/history/` keeps only post-mortems and ADR-grade decisions. `triage` and R8 score an ROI bucket
  only where the label set has `roi:*`; the ranking doc stays optional (#141).

### Budget

`hooks/` 1770 → 1800 for the REST fallback and the auto-merge route (#134); `workflows/` 1020 → 1035 for the models
block (#135); `routines/` 700 → 715 for the closing-keyword rule in six prompts (#137); `templates/` 1150 → 1230 for
the dev-database guard a consumer runs (#138); `test/` 3630 → 3690 for their cases; `CHANGELOG.md` 1000 → 1040 for
this section; `docs/` gets its own ceiling of 190 (#140).

## 0.17.7

The guards read a command as the shell does (#116). 0.17.6 cut every command at `;`, `&`, `|` and parentheses
whatever the quoting: that blocked a commit message or PR body quoting a guarded command, and it let guarded commands
through. Each case below exited 0 on 0.17.6 and now blocks; `test/hooks.test.mjs` carries every one.

- `lib.sh` lexes the command with an awk program (any POSIX awk): quotes and escapes, `$( )`, backticks (inside double
  quotes too, where they run), `<( )`, arithmetic, `case`, `[[ ]]`, arrays, comments, functions and heredocs (a body a
  shell reads is lexed, a `cat`, `tee` or data command's is dropped, any other's is walked raw). It walks the script
  of `bash -c`, `eval`, `npx -c` and a here-string a shell reads, and the guards' pre-filter ignores quotes.
- Newly blocked: `gh pr edit 12 --title "a; b" --base main`, `gh api … -f body="x; y" -f base=main`,
  `git push origin "$(echo main)"`, `` echo `git push origin main` ``, the body of `{ }`, `!`, `if`, `for`, `while` or a
  function, `cat <<E"O"F` (read as `E`), `npx -c '…'`, `g\it push`, a GraphQL mutation naming the branch (as a whole
  name, so `domain` no longer counts as `main`), and a `cd` that does not move the shell (behind `env` or `command`,
  in a pipeline, in the background) followed by `pnpm` or `npm`.
- No longer blocked: the prose of a data command (`echo`, `printf`, `git commit|tag|notes`, `gh pr|issue|release|api`)
  written plainly: nothing before it, not piped on, no backtick, `${`, `$((` or `$'`, and no `eval`, `source`,
  function or process substitution in the input. Claude Code's `"$(cat <<'EOF' … EOF)"` message form passes. Any
  other command is walked as 0.17.6 split it as well, so it is never checked less.
- Three cases flip to blocked: a double-quoted commit message whose backticks name a guarded command (bash runs it).
- `$(git rev-parse --show-toplevel)`, `$(git branch --show-current)`, `$(git rev-parse --abbrev-ref HEAD)` and
  `$(pwd)` resolve in the effective directory; any other substitution is not a literal.
- Fails closed without awk, when awk fails or its output is cut short, and past 4 nested `bash -c` / `eval` /
  `npx -c`; the doctor warns when awk is missing. The migrate-deploy reminder prints once per command.
- An oracle test runs a corpus under bash and zsh with logging shims and checks that the guards refuse a command
  that runs a refused call and pass the prose; a 200 KB heredoc and a 50 KB message stay well under a hook timeout.
- Consumers: `/shopify-app-kit:sync`; install awk where it is missing (macOS and most Linux images ship one).

### Budget

`hooks/` 1370 → 1770 and `test/` 3415 → 3630: the lexer replaces a 40-line splitter whose quoting let guarded
commands through, and the oracle that checks it against bash and zsh (#116).

## 0.17.6

Skills name the repository root, not `$CLAUDE_PROJECT_DIR` in braces, and `triage` scopes the 60-day schedule
shutdown to public repositories (#123).

- The Bash tool does not set `CLAUDE_PROJECT_DIR`, and the skill loader fills the braced form with the directory
  the session started in. In a session holding several repositories that is their parent, so `sync` would copy
  the hooks outside the consumer (and its `awk` check would read those copies and pass), and the `doctor` skill
  would find no manifest. `sync` and `doctor` now take `<root>` from `git rev-parse --show-toplevel` in the
  consumer's checkout and allow that command; the ten other skills read `.claude/shopify-app.json` from the repo.
  `kit-dev`'s "Add a skill" says so, and `test/skills-parity.test.mjs` fails a SKILL.md that uses the braced
  form. Hook commands keep the unbraced `$CLAUDE_PROJECT_DIR`, which Claude Code sets for hooks and the loader
  leaves as written.
- `triage` step 4: GitHub disables schedules in a public repository idle for 60 days, as 0.17.4 says elsewhere.
- Consumers: the skills arrive with the plugin update; `/shopify-app-kit:sync` moves the vendored hook headers
  (no hook body changed). Re-paste `triage` from its `## Prompt`.

## 0.17.5

The routine steps that could not run as written, the rest of #118. Re-paste `graphify-refresh`, `kit-health`,
`nuclear-review`, `kit-tidy` and `triage`.

- The graph branch is `graph`: `graph/` is not a valid branch name, so `graphify-refresh` could never push it
  (the routine, README, REGISTRY, doctor, `companion.md`, lesson kit-2, the `.claudeignore` template).
- `kit-health` step 3b clones the persona repository with `--filter=blob:none`, so the recorded commit is in
  the clone; its summary line names the count and commit without quoting placeholders, which a paste drops.
- `review` takes a commit or the empty tree as its base and diffs it two-dot. `nuclear-review` passes one (the
  empty tree monthly, the oldest merge's first parent weekly) and keeps its "last full review" in its own
  queue-issue comments, `nuclear-review: full <sha>`, instead of a tag it could not write.
- `kit-tidy` creates its branch before anything else (no guard hook loads with several repositories attached),
  keeps drafts under `/tmp`, stages files by name, and leaves a stale hook header to a step 1 issue.
- `triage` lists orphan labels instead of deleting them, finds the queue issue by title (no MCP tool can pin
  one), and applies a `decision:` comment only from an author with push permission.
- Consumers: re-paste the five routines from their `## Prompt`; the `graph` branch is new, nothing to rename.

### Budget

`test/` 3390 → 3415 for the test that each routine step can run as written (#118).

## 0.17.4

Rules that contradicted each other, and the sync and doctor gaps a review of 0.17.1 found (#118, part one; the
routine fixes follow in their own release).

- Billing: the test-flag and `app_subscriptions/update` checks in `review-correctness`, the release skill,
  `billing-live-posture.md` and release-readiness's billing dimension apply under `billing.method` `billing-api`
  only. A compliance handler that only returns 200 is P0 in `review-correctness`, as in the webhooks reference.
- `issue-filing`: R9's `bug` + `p1` is for a failed CI workflow; a routine's issue carries its prompt's priority
  and, per R8, an ROI bucket. R7 acts on a `decision:` comment only from an author with write access. Step 1
  passes `--file .github/labels.json` when the repo keeps its own label set.
- `kit-dev`: a routine prompt edit gets no CHANGELOG line, as `.claude/rules/kit.md` says. The 60-day schedule
  shutdown is stated for public repositories (doctor, `ci-posture.md`, lesson ci-4, two workflow templates).
- `sync`: line 2 of every vendored hook is checked with `awk 'FNR==2'`; the manifest is edited in place and its
  `$schema` repointed at the tag; the smoke test has allowed and MCP cases; the commit goes on a branch with a PR.
- `doctor.sh` reports `kit.version` or a kit `$schema` ref behind the installed kit, each vendored guard that
  neither `settings.json` nor `settings.local.json` registers (also when neither file exists), and a string
  `deploy.protectedWorkflows`; a weekday cron's cadence is its longest gap between days, not weekly.
- Consumers: the fixes arrive with the plugin update; `/shopify-app-kit:sync` moves the vendored hook headers and,
  per its new step 4, `$schema`. The doctor now reports a `kit.version` that lags the plugin.

### Budget

`hooks/` 1360 → 1370 and `test/` 3360 → 3390 for the doctor's new checks and their tests (#118). `CHANGELOG.md` 900 → 1000: these sections are the
consumers' upgrade notes and the release workflow publishes each one, so the file only grows.

## 0.17.3

The review workflows no longer return a clean verdict that their own evidence contradicts (#117).

- Dedupe: two blockers or majors merge only when they make the same claim, so a skeptic refuting one entry's lead
  claim never demotes a different serious finding merged under it; the skeptic is also shown every merged claim.
- `release-readiness`: a dimension `args.dimensions` leaves out stays an open `- [ ]` line marked "not checked",
  never ticked as not applicable. A ref that does not resolve is `no-go` (it was `go` on an empty range);
  `pre-pr-review` returns `changes-needed` for an unresolved base instead of approving an empty diff.
- The seven diff-stage agents review the range their prompt names, not always `origin/<default>...HEAD`.
- Consumers: the fixes arrive with the plugin update; `/shopify-app-kit:sync` moves the vendored hook headers.

### Budget

`test/` 3325 → 3360 for the regression test of each verdict bug (#117).

## 0.17.2

The guard hooks close the bypasses and the fail-open a review of 0.17.1 reproduced (#116). Each case below exited 0
on 0.17.1 and now blocks; `test/hooks.test.mjs` carries every one.

- `guard-protected-branch`: a failed `gh api` (expired token, 404, rate limit) no longer resolves to its error body,
  so a dispatch, rerun or cancel by numeric id fails closed. With jq, the tool name is `.tool_name` itself, so a
  `tool_name` key inside `tool_input` cannot spoof it; GitHub MCP server names match in any letter case.
- git push: `--branches`, wildcard and non-literal destinations, a push the repo's config sends to a protected
  branch (`remote.<r>.push`, `push.default` upstream / matching), and `git -c` that redirects a push or aliases one.
- gh: `pr edit -Bmain`, `workflow run <numeric id>`, `run rerun|cancel`, and `gh api` dispatches, run reruns, a PR's
  `base=`, `contents` and `git/refs` writes to a protected branch, GraphQL auto-merge, and a query read from a file.
- `lib.sh`: a here-string or a quoted `<<` no longer swallows the following lines; a heredoc fed to a shell is
  checked; `\`-newline is joined; `bash -c`, `sh -c`, `eval`, `sudo -u`, `env -i`, `timeout`, `nice`, `xargs` and
  `npx -p` are seen through. New `kit_pm_parse` reads npm/pnpm/yarn/bun past their global options.
- `guard-shopify-cli` and `guard-migrations`: `pnpm exec`, `npm exec --`, `npm run shopify|prisma --`,
  `npm --prefix`, `pnpm --filter` / `-C`, `npx -p`, `yarn` / `bun x` and `shopify app:deploy`; SQL spaced by more than
  one blank. `guard-package-manager`: npm's global options and its install/ci/link/dedupe aliases.
- Not changed: `;` and `&&` inside quoted text still split a command, so a commit message that quotes a guarded
  command can still be blocked (fail-safe; quote-aware splitting is a separate change).
- Consumers: `/shopify-app-kit:sync` vendors the new hooks.

### Budget

`hooks/` 1150 → 1360 and `test/` 3255 → 3325: the fixes are guard code a consumer runs on every command, and each
reproduced bypass gets a test (#116, #109).

## 0.17.1

`dev-loop` gains `references/storefront-qa.md`: how to test a theme app extension on a live, password-protected
storefront. It is knowledge, not code, per the decision on #101 (vendor a harness once a second product needs one).

- The password bypass (a 302 from `POST /password`, the two cookie names, the per-IP 429, a one-cookie
  `storageState`), pinning an unpublished theme, the placement probe's checks and exit codes, a Lighthouse budget,
  and the CI shape (one worker, no retries, one concurrency group, never upload traces).
- The three cloud-session browser facts: no Google Chrome; launch the preinstalled Chromium by path through
  `CHROME_PATH`; Chromium trusts the egress proxy only through its NSS store.
- Consumers: the reference arrives with the plugin update; `/shopify-app-kit:sync` moves the vendored hook headers
  to 0.17.1 (no hook body changed). Nothing to configure.

## 0.17.0

`guard-protected-branch` also guards the GitHub MCP tools: a session that reaches GitHub through MCP rather than
`git` or `gh` can no longer push to, merge into or retarget a PR at a protected branch, or run a protected workflow.

- The guard reads `tool_name` and, for an `mcp__*github*__` tool, applies the Bash rules to its `tool_input`:
  `push_files`, `create_or_update_file`, `delete_file` and `create_branch` on a protected `branch` (none named:
  blocked); `update_pull_request` with a protected `base`; `merge_pull_request` and `enable_pr_auto_merge` into a
  protected base; `actions_run_trigger` `run_workflow` of a `deploy.protectedWorkflows` entry, and its rerun or
  cancel methods on a run of one. It applies on any repo the call names. Every other MCP tool passes.
- A merge names only a PR number and a rerun only a run id, so the guard resolves the base and the run's workflow
  (and a numeric workflow id) with `gh`; when it cannot, the call is refused, as `gh pr merge` already is. A
  session without `gh` merges and reruns from the GitHub UI.
- Registration is a second `PreToolUse` entry, matcher `mcp__.*github.*` (any MCP server name containing
  `github`), for `guard-protected-branch.sh` only: `templates/.claude/settings.json`, the `sync` snippet, the
  doctor skill and README. `hooks/doctor.sh` reports a consumer that vendors the guard without the MCP entry.
- `lib.sh`: `kit_parse_input` also sets `$tool`; new `kit_tool_arg KEY` and `kit_raw_tool` (no jq).
- Consumers: `/shopify-app-kit:sync`, then add the MCP entry from its snippet to `.claude/settings.json`; a
  tripwire that asserts every guard sits under the `Bash` matcher still holds.

### Budget

`hooks` raised from 1070 to 1150 for the MCP branch of the guard and its `lib.sh` helpers (about 70 lines).

## 0.16.12

The doctor's `kit.*` checks follow the schema, and a routine reaches installs in a new version (#89, #90, #91, #96).

- `hooks/doctor.sh` reads the `portfolioId` and routine-name patterns from the schema beside it, as it already did
  the top-level keys; the README points at the schema, and a test fails on a second copy in either. It reports a
  `kit.routines` entry that fails the pattern, matches no routine file by its exact name (`../CHANGELOG`, or
  `registry` on a case-insensitive disk) or names the kit-scoped `kit-tidy`. A `kit` that is not an object keeps
  the facts paragraph and writes nothing to stderr. (#90, #91, #96)
- Adding, removing or renaming a routine bumps the version, and CI enforces it: an install sees `routines/` only
  through a new version, so the doctor's "update the kit" now helps. A prompt edit still needs no bump;
  `.claude/rules/kit.md`, `kit-dev` and the doctor skill's report step say so. (#89)
- Consumers: the fixes ship with the plugin (the doctor is not vendored); the guards change only their version line.

### Budget

`CHANGELOG.md` raised from 800 to 900, as the 0.16.4 note foresaw. These sections are the consumers' upgrade notes:
the release workflow publishes each one and `kit-health` summarises those between a consumer's version and the
latest, so none is removed. 900 is about ten more releases.

## 0.16.11

Without jq, the guards catch every spelling of the commands they refuse (#88, #97).

- `lib.sh` gains `kit_raw_words` (the raw command as words; JSON escapes, quotes, slashes and shell operators split
  them), and the protected-branch and migrations pre-filters match program and verb in order: `git -C . push`,
  `git<TAB>push`, `/usr/bin/git push` and `migrate  reset` fail closed too, and so, on purpose, does a mention like
  `git commit -m "push later"`. guard-migrations builds the words only without jq. Consumers: `/shopify-app-kit:sync`.

## 0.16.10

The guards fail closed under macOS's stock bash 3.2 (#87).

- `hooks/guard-protected-branch.sh` read its lists with `mapfile`, which bash 3.2 (macOS's `/bin/bash`) lacks: it
  exited 1 on an unbound variable, and Claude Code, which blocks only on exit 2, ran `git push origin main`. It now
  reads them line by line, and a manifest without `deploy.protectedWorkflows` no longer trips `set -u`.
- `hooks/lib.sh` gains `kit_fail_closed_on_exit`, which every guard calls right after sourcing it: a guard that fails
  on its own (any exit but 0 or 2) blocks the command. `doctor.sh` does not call it and still never exits non-zero.
- CI runs `test/hooks.test.mjs` on `macos-latest` with `/bin/bash` 3.2 and BSD sed; the tests pin the net in every
  guard and cover a manifest without `deploy.protectedWorkflows`, and `kit-dev`'s add-a-guard step says the same.
  Consumers pick up the guards with `/shopify-app-kit:sync`; the doctor reports the version drift until then.

## 0.16.9

The "things nothing reads" family from the first scheduled `kit-tidy` run (#71, #72, #73).

- `skills/release/SKILL.md` step 5 points at `references/ci-posture.md`, the one reference no step named: a deploy
  workflow GitHub has disabled for inactivity never fires. The day count stays in the doctor hook and its two
  pinned docs. (#73)
- `kit-tidy` step 3 no longer reports the `$schema` and `$comment` metadata keys (notes for editors and people,
  which the starter manifest uses) or a fixture one test reads; it reports a fixture no test reads, by name or by
  listing its directory. The release-train fixture it flagged is schema-checked by `test/schema.test.mjs`'s
  directory listing. The stored routine prompt needs re-pasting. (#71, #72)

## 0.16.8

The review agents' shared lines are true for every launcher and held identical (#45, #69).

- `review-correctness` and `classifier-reviewer` said the parent put their context "under `### Manifest`,
  `### Diff`, `### Changed files` and (optionally) `### PR`". The `review` skill never names those headings, and
  `release-readiness` launches `review-correctness` with the range and file paths instead; `review-quality`'s copy
  had already dropped the PR slot. All three now open with one input contract that is true for both launchers.
- A subagent reads only its own file, so the verdict line, the input contract and (for the two reviewers that grade
  `[P0]`-`[P2]`) the severity legend stay in each agent as copies. `test/agents-parity.test.mjs` holds them
  identical, as it holds the roster's standing clause. `kit-tidy` step 2 ignores any agent text that test pins, so
  its next run does not re-file them; the stored routine prompt needs re-pasting for that to apply. (#45, #69)

## 0.16.7

A `human:*` label says who does the work, not who closes the issue.

- R7 in `skills/issue-filing/references/rules.md` now lets a session close a `human:*` issue once the human has
  done the work and the issue's close condition is met, saying in its closing comment what met it. An agent
  still never does that work, a routine still never closes a `human:*` issue (it runs unattended and cannot see
  that the work is done), and the two relabelling exceptions are unchanged. The skill's step 7, the README's
  rule list, lesson ops-5 (its link follows the renamed heading), the `CLAUDE.md` and
  `.claude/rules/pr-and-issues.md` templates and both copies of the work-item template say the same. The
  routines keep their "never closes a `human:*` issue" line, which R7 now states for routines itself.

## 0.16.6

The doctor checks the two portfolio keys a consumer declares (#42).

- `hooks/doctor.sh` validates `kit.portfolioId` against the schema's pattern and `kit.routines` as an array of
  strings, prints `Portfolio: <id>; routines: <list>.` in the facts paragraph when the id is set (an opaque id
  is safe to print), and reports one `Drift:` line per `kit.routines` entry with no `routines/<name>.md` next
  to the hook: a typo, or a routine the kit removed, which a cross-repo routine would otherwise find out at run
  time. Skipped when `routines/` is not beside the hook, like the schema check. The doctor sees only its own
  kit version, so an entry for a routine a newer kit added reads as not shipped until the plugin is updated,
  which the message says. `test/hooks.test.mjs` covers the fact, the bad entry and the two problem lines; the
  doctor skill and the README's doctor-printed keys say the same. (#42)

## 0.16.5

Without jq, the guards fail closed on the command, not on the checkout path (#38).

- Each guard's no-jq branch matched the whole hook payload, `cwd` included, so a checkout whose path carried
  `shopify`, `deploy`, `pnpm`, `git push` or `migrate reset` blocked every command when jq was missing (the kit's
  own test consumer directory did). `hooks/lib.sh` gains `kit_raw_command`, which isolates `tool_input.command`
  from the payload with one portable `sed` expression, JSON escapes left in place, and falls back to the whole
  payload when no command key is there, so an unknown shape still fails closed; the four guards match on it.
  `test/hooks.test.mjs` runs every no-jq case from a directory named with every guard's words and pins the
  fallback. A consumer's vendored copies under `.claude/hooks/kit/` keep the old branch until
  `/shopify-app-kit:sync`; the doctor reports the version drift until then. (#38)

## 0.16.4

The registry's maintainer step says how a routine is really made (#44).

- `routines/REGISTRY.md`: a routine is made on the claude.ai routines page with exactly one repository, an
  environment (Default unless the routine reaches a host outside the allowlist), a schedule whose exact cron is
  set with `/schedule update`, and a first run fired by hand and read before the schedule is trusted. The
  `create_trigger` tool a session holds takes no repository, so the session it fires has no checkout and goes
  idle having written nothing (found by firing the `kit-tidy` trigger, #40); it wakes a session, it cannot run
  a routine. `test/routines.test.mjs` pins the new text and refuses the old recipe; `kit-dev`'s `add.md` and
  `layout.md`, `new-app`'s checklist and the README say the same. (#44)

### Budget

`CHANGELOG.md` raised from 700 to 800. The release procedure extracts each version's notes from this file and
never removes a section, so the file grows by one section per release (about ten lines) and a ceiling on it is
a reminder to write short sections, not a limit the file can stay under. #63 and this version landed the same
day and the second one crossed 700; 800 is about eight more releases.

## 0.16.3

The release checklist's `app dev clean` line becomes a condition a person can tick, not a chore on every release.

- `workflows/release-readiness.js` ended every checklist with `- [ ] app dev clean run on the dev registration`,
  whatever the range held, so a consumer's promotion PR carried it as open work after a release with no `app dev`
  session behind it. It now reads `- [ ] No app dev session left on the dev registration (if one ran since the
  last clean, run app dev clean)`. The box stays unticked because the workflow cannot see the registration's
  URLs; a person ticks it at once when no session ran. `test/workflows-run.test.mjs` asserts the new text.

## 0.16.2

The weekly deep review can run (#61), and the hooks tests make room for what the queue adds next (#46).

- `skills/review/SKILL.md` no longer sets `disable-model-invocation: true`. `routines/nuclear-review.md` step 2
  runs the skill from a scheduled session, whose Skill tool refuses a user-only skill, so every scheduled run
  stopped there and the routine had never produced a review. The trade-off is that a session may now start the
  deep review on its own when a request matches the skill's description (a harsh, thorough or full review of a
  branch or PR). `test/routines.test.mjs` fails when a skill a routine's Tools field names is user-only, so a
  routine cannot depend on one again; kit-health's `doctor` passes, and the `sync` its prompt names only as text
  to write into an issue is not in its Tools field. Consumers pick this up with the plugin version; their
  trigger prompts need no edit. (#61)
- `test/hooks.test.mjs`: one `guardCases` runner for the four guards (the shopify-cli block had its own copy of
  the assertions, and every migrations case ran the guard twice), the four no-jq tests as one table, and a
  `checkout` helper for the six tests that built a consumer root by hand. 53 lines out, the same 239 cases;
  `test/` is back to 57 lines under its ceiling, which stays at 3420. (#46)

## 0.16.1

Docs held to their sources (#57, the first `kit-tidy` step-5 family): every sentence that restated a test
constant or a directory listing now either points at the source or is asserted against it.

- `test/docs-mirror.test.mjs` checks the README's label counts, required manifest sections, severity set and lesson
  classes; `kit-dev`'s skill cap, `disallowedTools`, `meta` keys, routine header fields and consumer reads; the
  ladder in the issue-filing references; and the doctor's idle threshold, each read from its source.
- `kit-dev`'s `layout.md` rows name the test that holds each fact instead of restating it; `personas.md` no
  longer copies the frontmatter allowlist; the `doctor` skill no longer lists the cadence thresholds; the README
  no longer lists the template placeholders (`templates/README.md` is the list).

## 0.16.0

The pull loop closes (#30): the door lessons enter through, and the routine that proposes what should leave.

- `.github/ISSUE_TEMPLATE/lesson-proposal.md` in the kit repository: the rule, the failure it prevents, where it
  bit (portfolio ids only, twice in one product or once in two), the proposed home and class, and the artifact
  that will cite it, without which the row cannot enter. The kit's `work-item.md` and `config.yml` are the
  templates' copies, held byte-identical by `test/docs-mirror.test.mjs`. Source labels are now a product's
  `kit.portfolioId` or a founding `app-N` label, read by both tests from the first column of `lessons/README.md`'s
  Sources table instead of a closed set in code; `lessons/README.md`'s "Adding a lesson" points at the door and at
  `kit-dev` instead of repeating the procedure. (#27)
- `kit-tidy` step 8, deprecation candidates, when the portfolio step found a product: a manifest section or
  guard-read key no discovered manifest declares, a guard no discovered consumer registers in its
  `.claude/settings.json`, a skill, agent or workflow nothing names; a candidate is one seen in two consecutive
  runs (the open `kit-tidy: deprecation candidates` issue is the memory). The routine proposes, a maintainer
  decides through `kit-dev`'s removal procedure. The guard-block log the issue sketched is not built: a log a
  cross-repo routine could read would have to be committed in the consumer's tree, and a committed log is wrong;
  registration in `settings.json` is the honest signal the tree already carries. (#29)


## 0.15.0

Phase 2 opens (#30): the kit's first routine on itself, and the portfolio derived from the consumers instead
of listed in a public file.

- `routines/kit-tidy.md` (weekly, `37 5 * * 5`, in the kit repository only): runs the suite and the validate
  commands, then reports what the tests cannot express as `kit-tidy:` issues (duplicated prose across files,
  things nothing reads, the size trend from `test/budget.json` and the insert:delete ratio since the last tag,
  docs that restate a test), opens one PR per run limited to the mechanical drift a mirror or parity test names,
  and tabulates the discovered portfolio (id, `kit.version` against the latest tag, declared sections,
  routines). Never a deletion, a lesson row, a hook body, a schema or a test assertion. `test/routines.test.mjs`
  knows one kit-scoped routine (no manifest to read). (#28)
- `portfolio.json` is gone: a public file that could hold only private facts (names, repositories) or opaque ids
  was a second copy of what every manifest knows about itself. The schema gains `kit.portfolioId` (an opaque id,
  pattern-checked so a name cannot pass) and `kit.routines`; a cross-repo routine lists the repositories under the
  remote's owner it can read, fetches each manifest and keeps those carrying the id. `kit-health` step 4 discovers
  instead of reading a file; `new-app`'s checklist sets the two keys; `routines/REGISTRY.md` carries the one
  description ("Discovering the portfolio"); every manifest fixture that declares `kit.routines` names routines
  that exist. (#26)

### Budget

`routines` raised from 610 to 700 for `kit-tidy.md`, the routine #28 decided and #30 sequenced: the first one
that runs on the kit itself, so nothing already in `routines/` could give way for it.

## 0.14.0

The lessons index is read-side (#24, Phase 1c of #30): a row lives only while something a session reads cites it.

- `test/lessons-index.test.mjs`: every live row must be cited by id from a `SKILL.md`, an agent, a template rule
  seed, a workflow or a routine prompt; the writer-side rule ("every reference file is the home of a lesson") is
  gone, because a reference's justification is its `SKILL.md` link (which the parity test enforces) and the two
  rules contradicted each other. History rows carry a `reason` column, sit under a dated subsection, and are never
  also live. The 35-row floor is gone.
- `lessons/INDEX.md`: every one of the 123 rows moves to `## History` under `### 2026-09-25 uncited`, because
  nothing a session reads named any of them (the README named two). The text is untouched: every reference file
  and agent section stays where it was and linked from its skill. A History row returns to the live table the
  moment an artifact cites it, and a new lesson enters with its citation (the proposal door, #27).
- `lessons/README.md`, the README's Lessons section and `kit-dev`'s "Add a lesson" state the reader-side rule and
  the citation step. The three template rule seeds cite the reference files they seed from instead of lesson
  prefixes (`mig-*`), which named nothing in particular.


## 0.13.0

Phase 1, second half (#30): the docs are asserted against their sources, the whole tree has a size budget that
only ratchets down, and the kit has its own CLAUDE.md.

- `test/docs-mirror.test.mjs`: every enumeration the README and the skills carry is checked against the thing it
  enumerates: the shipped guards (the "What you get" table and the `sync` snippet), the routines (both README
  lists), the review rosters and the release dimensions (the workflows' tables), the dedupe window and the skeptic
  cap (`LINE_FUZZ`, `VERIFY_CAP`), the label set, the version-bump directories (CI's list, in README, CLAUDE.md
  and `kit-dev`), the graphify pin. The copies that could not be asserted are gone: the README's settings snippet
  (now a pointer to `sync`), the `release` skill's hand-written checklist (the workflow is its one source), the
  `doctor` skill's guard names (the glob is the rule), and the counted enumerations ("nine personas", "six
  references"). The README is capped at 400 lines: the `new-app`, `pre-pr-review` and `release-readiness`
  restatements are shortened to what the README alone says. (#21)
- `test/budget.json` and `test/budget.test.mjs`: a line ceiling per top-level directory, per root file (README
  400, CHANGELOG 700, CLAUDE.md 40) and per file class (a SKILL.md 60, a reference 155, an agent 140, a routine
  115). Lowering a ceiling is free; raising one sets `raisedIn` and needs a `### Budget` line in that version's
  CHANGELOG section. The test prints the headroom per directory. The 60-line SKILL cap now applies to every skill
  (`test/skills-parity.test.mjs`): `review` and `sync` are trimmed to fit, and `kit-dev` keeps its procedures in
  `references/` (`layout`, `add`, `remove`, `personas`, `release`), exempt from the `Sources:` line and the
  lesson-home rule because they are maintainer procedures, not consumer lessons. (#23)
- `.claude/rules/kit.md`, the repo's own always-loaded context: the posture (one source per fact, additions name
  their consumer evidence, removal is a procedure), the private-name rule, the commands and the version-bump rule,
  in under 40 lines. It is an unscoped rules file rather than a root `CLAUDE.md` because the repo root is the plugin
  root and `claude plugin validate --strict` rejects a `CLAUDE.md` there (it is not plugin content and must not ship
  to consumers). The three `claude plugin validate` commands CI runs are now listed, identically, in the README,
  `kit-dev` and this file, and `test/docs-mirror.test.mjs` holds them to `ci.yml`. (#25)

### Budget

The first ceilings: each directory at its size on this version rounded up about 5%, the file classes at their
largest member rounded up, README at 400 (it was 439), CLAUDE.md at 40. No consumer need is named because nothing
was raised; every later raise names one here.

## 0.12.0

Phase 1 of the self-maintenance plan (#30): the mechanics that keep the kit tight, and the first removal
procedure. No behaviour a consumer relies on changes except the two no-jq fallbacks below.

- `hooks/lib.sh` gains the fail-closed prologue every guard shares: `kit_require_jq`, `kit_require_manifest` and
  the lazy `kit_ensure_manifest`. The four guards call them instead of carrying copies. Two no-jq fallbacks that
  hard-coded repo assumptions are gone: `guard-package-manager` no longer lets `cd web && pnpm …` through, and
  `guard-protected-branch` fails closed on every guarded verb (`git push`, `gh pr merge`, `gh pr edit`, `gh api`,
  `gh workflow run`) rather than on commands mentioning `main` or `deploy.yml`; without jq the manifest's names
  cannot be read, so no name may decide it. `test/hooks.test.mjs` has a no-jq case per guard. (#18)
- `test/lib/fs.mjs`, `frontmatter.mjs` and `kit.mjs` hold the helpers the test files re-implemented per file
  (`kitRoot`, `walk`, `read`, the frontmatter reader, `KIT_VERSION`, `PLACEHOLDER`, `run`). Behaviour unchanged. (#19)
- `workflows/`: the blocks the three scripts share (constants, the two schemas, dedupe, the skeptic pass, the
  verdict counts) are marked `// @shared <name>` … `// @end`, and `test/workflows-shared.test.mjs` keeps every copy
  byte-identical, naming the first differing line. Per-workflow behaviour goes through three parameters declared
  above the dedupe block (`TOPIC_NEEDS_SAME_CLAIM`, `mergeExtra`, `newExtra`). The three divergences that had crept
  in are reconciled: one sort order (file, line, section) for every workflow, and `release-readiness`'s "same
  section needs the same claim" rule is now the declared parameter, not a fork. (#20)
- `kit-dev` gains "Remove a skill, agent, hook, workflow or routine": deprecate in one minor (a `Deprecated:`
  description prefix, or line 3 of a guard's header), delete in the next. `hooks/doctor.sh` reports a vendored
  guard the kit no longer ships and one the plugin marks deprecated; `sync` deletes stale vendored copies. (#22)
- Version 0.12.0 (`lib.sh` API, doctor output, `kit-dev`).


## 0.11.1

Phase 0 of the self-maintenance plan (#30): the defects the survey found, and the drifted docs.

- `hooks/doctor.sh` derives the manifest's known top-level keys from `schemas/shopify-app.v1.schema.json` instead of
  a hand-kept list that had already fallen behind (`classify` was reported as an unknown key). Without the schema
  next to the hook the unknown-key check is skipped. `test/hooks.test.mjs` runs the doctor over a manifest that
  declares every schema section. (#15)
- `workflows/pre-pr-review.js`: a reviewer that returned nothing keeps the verdict off `approve`
  (`changes-needed`, the uncovered lens named in the log), matching `plan-review` and `release-readiness`.
  `test/workflows-run.test.mjs` covers a dead reviewer with no other findings. (#16)
- Docs: the README's routine lists include `dev-parity`; `kit-dev` gives `npm test` (the bare `node --test test/`
  form fails on Node 22); the phantom `.mcp.json` is gone from the version-bump directories in CI, the README and
  `kit-dev`. (#17)

- `routines/dev-parity.md` (weekly, `43 6 * * 4`): keeps a consumer's dev registration and hosted beta at parity
  with its prod app while they sit dormant before launch. It diffs the paired app tomls, Fly tomls and deploy
  workflows down to by-design keys after the repo's own tripwires, checks that the beta deploys are green on
  the newest touching commit, reads each host's health endpoint for ok, the deployed commit and the billing mode,
  and once a month comments the unticked human checklist on the parity issue the trigger's preamble names. Each
  drift is one `dev-parity:` issue (R9); it never fixes, dispatches, pushes or runs a Shopify or Fly CLI. It has a
  row in `routines/REGISTRY.md`, runs only where the manifest has a beta target and a dev config, and stays off
  the placeholder roster in `portfolio.json`; `test/routines.test.mjs` covers it. `routines/` is not
  plugin-visible, so no version bump.

## 0.11.0

Cheap, high-speed classification (Jev / TypeSafe) as a first-class kit capability: the generic transport contract,
the manifest governance and one worked exemplar, no opinionated vertical handlers.

- `skills/classify` (`/shopify-app-kit:classify`, model-invocable): the classification primitive as a contract the
  consumer app implements, the way `mcp-connector` ships an MCP server the kit never runs. One transport calling
  `provider: jev` through a single module that reads `TYPESAFE_API_KEY` in one place and returns
  `{ choice, confidence, probabilities }`; every call names a `labelSets` id declared in the manifest; the call is
  billed against a per-tenant budget decremented in the same transaction and, under `database.rls`, inside
  `withTenant`; a call auto-acts only when `confidence >=` its threshold and otherwise escalates to a cheap,
  reversible path. Five references: `jev-transport.md` (one transport, the three typed primitives Choice/Score/
  boolean, text-only, rules stay rules), `label-registry.md` (the manifest as the label source of truth and the
  parity tripwire), `budget.md` (the per-tenant budget), `thresholds-and-escalation.md` (never auto-act below the
  floor, cheap reversible escalation), `operator-mcp-tool.md` (the billed, budgeted, role-scoped operator MCP
  classify tool — the cheapest first call, near-zero new plumbing on the existing MCP surface). Lessons `cls-1`..
  `cls-5` in `lessons/INDEX.md`.
- `schemas/shopify-app.v1.schema.json`: an additive `classify` section — `provider` (`jev`),
  `defaultEscalateThreshold`, `budget.monthlyCap`, and a `labelSets` registry mapping a job id to its `labels`
  (2..255) and an optional `escalateThreshold`. Top level stays closed; the section grows additively. Exercised by
  a new `classify` block in `test/schema.test.mjs` (a valid section validates; unknown provider, a labelSet under
  two labels and a missing `labels` array fail; older fixtures still validate without it).
- `agents/classifier-reviewer.md` (read-only, manifest-aware): checks a diff's classification against the
  `classify` section — every call names a declared label set, is budgeted, never auto-acts below its threshold,
  passes no image to the text-only classifier, and keeps deterministic signals as rules. The `review` skill
  launches it alongside `review-correctness` and `review-quality` when the manifest declares `classify`. Lens
  `cls-6`.
- `templates/.env.example`: `TYPESAFE_API_KEY` (SECRET), present only when the app uses the classify skill.
- README "What you get" and the manifest contract document the new skill, agent and `classify` keys.

## 0.10.0

The release gate and the plan gate as workflows, a fourth guard for destructive Prisma commands, and the procedure
for re-syncing the review personas from upstream.

- `hooks/guard-migrations.sh` (PreToolUse, vendored like the other three): blocks `prisma migrate reset` under
  any prefix (`npx`, `pnpx`, `bunx`, `pnpm exec`, `pnpm dlx`, `pnpm prisma`, `npm exec [--]`, `yarn [dlx]`,
  `bun x`, a path to the binary, bare `prisma`, after a `cd`, after an env assignment), `prisma db push` carrying
  `--force-reset` or `--accept-data-loss`, and `prisma db execute` when the command text (a heredoc body
  included) carries `DROP DATABASE`, `DROP SCHEMA` or `TRUNCATE`, case-insensitively. Everything else Prisma
  passes (`migrate dev|deploy|status|diff|resolve`, `generate`, `db pull|seed|push`, `studio`, a `db execute` that
  drops a table, `npm run <script>`). On an allowed `prisma migrate deploy` with `deploy.scaleToZeroBeforeMigrate`
  true the guard prints one reminder line on stdout (exit 0) naming the key and the release skill's
  `migrations-and-zero-downtime.md`; a missing manifest means no reminder, never a block. The block message quotes
  `database.provider`, `database.sharedDevDbWithBeta` and `paths.prisma` from the manifest and points at the
  forward-only path. Prose never blocks (heredoc bodies stripped by `lib.sh`, an `echo`, a `git commit -m`, a
  `grep`). Fails closed without jq or without a manifest for the guarded forms only, as `guard-package-manager`
  does. `test/hooks.test.mjs`: a `guard-migrations` block over the npm-root, pnpm-root, release-train and missing
  fixtures (blocked, allowed, the reminder asserted on stdout and its absence when the key is false, prose, no
  jq through a sandbox PATH). Registered in the `sync` snippet and its "one entry per guard" sentence, `doctor`
  step 4, the README's table, adoption snippet and manifest-contract rows (`deploy.scaleToZeroBeforeMigrate`;
  `paths.prisma`, `database.provider`, `database.sharedDevDbWithBeta`), `templates/.claude/settings.json` (now
  asserted by `test/templates.test.mjs` to register exactly the guards under `hooks/`), `templates/CLAUDE.md`'s
  hard constraints and the `prisma.md` rule seed. No schema change: every key it reads already existed.
- `workflows/release-readiness.js` (`/shopify-app-kit:release-readiness [{ base, head, pr, dimensions }]`): a
  scoping agent reads the manifest and the promotion range (`branches.promotion.from` -> `.to`, or the
  arguments), the changed files, migrations, pin files, tomls, extension files, workflow files and the open
  promotion PR's body; then only the dimensions the manifest enables run in parallel, each as one read-only kit
  agent on the shared finding shape: `api-version` and `webhooks` and `billing` (`review-correctness`; billing
  only when `billing.live`), `migrations` (`prisma-migration-reviewer`, only when the range touches
  `paths.prisma`), `branch-model` (`qa-review-security-governance`), `extension`
  (`storefront-extension-reviewer`, only when `paths.extensions` is non-empty) and `app-store-review` (a public
  app: one note telling the operator to run the companion's `shopify-app-store-review` skill, no agent). Findings
  on the same spot or the same claim merge; every blocker and major goes to a skeptic (cap 12); the verdict is
  `no-go` on a surviving blocker, `go` only when every dimension ran clean, `go-with-notes` otherwise, and a
  dimension that returns nothing is listed as uncovered and keeps the verdict off `go`. The result carries a
  checklist block for the promotion PR body: the `release` skill's step 7 lines plus one per dimension, ticked
  where the dimension passed or does not apply. `test/workflows-run.test.mjs` (`release-readiness under a stub
  runtime`): dimension selection from the manifest (billing off, extensions empty, prisma untouched, webhooks
  absent, a public app), a confirmed blocker -> `no-go`, a refuted blocker -> `go-with-notes`, a failed
  dimension never `go`, the checklist lines, no manifest -> `no-go`, an empty range -> `go`. Wired into
  `skills/release/SKILL.md` as step 2 (a `no-go` means the PR is not opened; the checklist and verdict go into the
  PR body) and the README.
- `workflows/plan-review.js` (`/shopify-app-kit:plan-review <plan file | PR number | #issue | { plan, pr, issue,
  reviewers }>`): a scoping agent returns the plan text, its sections, the raw request it cites, the manifest
  sections it touches and the ADR directory when `docs.adrDir` is set; the four `design-review-*` agents run in
  parallel on the shared finding shape plus an optional `adr: true` tag (the location is the plan section; file
  `""` and line 0 unless the evidence is in the checkout); findings on the same section merge into one carrying
  both claims, the higher severity and the tag; blockers and majors go to a skeptic; the verdict is `rethink` on
  a surviving blocker, `revise` on a major or a reviewer that returned nothing, else `sound`; the decisions the
  plan should record as ADRs are returned separately. `test/workflows-run.test.mjs` (`plan-review under a stub
  runtime`): the four launches, two reviewers merged on one section, refutation, a failed reviewer, the argument
  forms, no plan. `test/workflows-run.test.mjs` now loads any of the three scripts. `pre-pr-review`'s `whenToUse`
  and `skills/review/SKILL.md` point at `plan-review` for plans; README rows and a "The release-readiness and
  plan-review workflows" subsection.
- `skills/kit-dev/SKILL.md`: "Re-sync the review personas from upstream" (shallow-clone upstream `main`, diff
  each changed persona's four headings and standing clause against `agents/<name>.md` ignoring the frontmatter
  and the kit's rewritten packet language, port substantive deltas in the persona's voice, keep the frontmatter
  allowlist, run `test/agents-parity.test.mjs`, record the new upstream commit in the CHANGELOG, bump the
  version; `worker-builder`, `worker-bounded`, `grounding-scout`, `audit` and `validation-runner` stay unported,
  `validation-runner` being the candidate for a future `test-digest` agent). "Add a guard hook" step 6 now lists
  every registration point. `routines/kit-health.md` gains step 3b: report the count of upstream persona files
  changed since the recorded commit, as one `p3` issue, porting nothing (no new routine).
- Hook headers, `KIT_VERSION`, `plugin.json` and the annotated fixture's `$schema` bumped to 0.10.0; the three
  existing guards' logic unchanged.

## 0.9.0

The operating layer: `labels.json` (the eight work types, priorities, ROI buckets, gating and origin labels, the
`ladder`) and `scripts/sync-labels.mjs`; the `issue-filing` skill with its ten rules and the executor ladder; the
`routines/` prompt texts with `REGISTRY.md`; the portfolio; the doctor's `Schedule:` liveness lines; the graphify
companion, pinned, installed by the bootstrap hook and kept to the `graph/` branch.

## 0.8.0

The `new-app` scaffold skill (`scripts/apply-overlay.mjs`, the post-scaffold edits, verification, the maintainer's
checklist; `references/scaffold.md` and `carry-over.md`) and `test/new-app.test.mjs`; the companion plugin wired
into the doctor (`references/companion.md`) and into `admin-api`, `dev-loop` and `release`.

## 0.7.0

Schema v1 gains `auth.expiringOfflineTokens`, `billing.method` and `docs.*`, additively; `templates/`, the repo shell
a new app starts from, with `test/templates.test.mjs`; the `tenancy` and `mcp-connector` skills and their references.

## 0.6.0

The `pre-pr-review` workflow, the kit's first: a scoping agent, the diff-stage `qa-review-*` roster in parallel (the
stack reviewers when the diff touches their files), findings merged by spot, a skeptic per blocker or major, one
verdict; its parity and stub-runtime tests.

## 0.5.0

Ported from `StarshipSuperjam/engine-template@0c0a693eebe511736e886ee2aeb804c941bfbb03`: nine review personas (the
plan-stage `design-review-*` four, the diff-stage `qa-review-*` five) under the port rules `personas.md` keeps, plus
`prisma-migration-reviewer` and `storefront-extension-reviewer`; `agents-parity` asserts the roster.

## 0.4.0

Skills `dev-loop`, `admin-api`, `release`, `tripwire` and `docs-owner` with `references/`; `lessons/INDEX.md`;
`release-tag.yml` tags `v<plugin version>` on push to `main` and publishes the Release from the CHANGELOG section (no
hand-pushed tags).

## 0.3.0

`hooks/guard-protected-branch.sh` (`git push`, `gh pr merge`, `gh pr edit --base`, `gh api` writes and `gh workflow run`
against `branches.*` and `deploy.protectedWorkflows`) and `hooks/guard-package-manager.sh` (`packageManagers`), both
failing closed; MIT `LICENSE`.

## 0.2.1

Schema v1 allows `$schema` and `$comment` at the top level and the doctor knows them; README: the public marketplace pin
needs no token. Hook logic unchanged.

## 0.2.0

`agents/review-correctness.md` and `agents/review-quality.md`, modelled on Cursor's Thermos plugin (MIT) and keyed to
the manifest; `skills/review/SKILL.md` runs both and synthesizes one verdict; `test/agents-parity.test.mjs`.

## 0.1.0

First release: the plugin skeleton and marketplace; manifest schema v1 (policy enums for `shopifyCli`, `configs.*`
required under `config-required`); `hooks/lib.sh`; `hooks/guard-shopify-cli.sh` (`app dev` per `devPolicy`, `app deploy`
per `deployPolicy`, `app config use` per `configUsePolicy`, `<pm> run deploy` unless deploy is `allowed`, `theme dev` per
`themeDevFromRoot`); `hooks/doctor.sh`.

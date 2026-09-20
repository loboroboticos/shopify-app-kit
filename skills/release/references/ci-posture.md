# CI posture for a Shopify app repository

Workflow conventions that hold across the consumer apps and this kit. Each is cheap on day one and expensive
to retrofit.

## Pin every action by commit SHA

`uses: owner/action@<40-char sha> # vX.Y.Z`. A tag can be moved; a SHA cannot. The trailing comment is the human
name, and Dependabot (`package-ecosystem: github-actions`) bumps both. A tripwire can grep every `uses:` line for
the pattern.

## Least-privilege permissions per workflow

A top-level `permissions:` block on every workflow (`contents: read` as the default), widened per job only when
that job writes (`contents: write` to push a tag, `issues: write` to open an issue, `pull-requests: write` to
comment). Never the org default.

## One concurrency group per workflow

`concurrency: { group: <workflow>-${{ github.ref }}, cancel-in-progress: <deliberate> }`. Cancel superseded runs
on PR checks; never cancel a deploy or a release in progress. The choice is written per workflow and reviewed
when it changes.

## Cron minutes off the hour

Scheduled workflows run at minutes like `17` or `43`, never `0`, and no two schedules in the repo share a minute.
The platform delays and drops runs that pile up at the top of the hour.

## A workflow whose file is an input lists itself in `paths:`

A workflow triggered on `push` with a `paths:` filter does not run when only its own file changes, so an edit to
it is never exercised until the next unrelated change. Every such workflow lists its own path
(`.github/workflows/<self>.yml`) in the filter, and a tripwire asserts it.

## Scheduled workflows die after 60 days of inactivity

The platform disables `schedule:` triggers in a repository with no commits for 60 days, without a notification
that anyone reads. A quiet repository stops reconciling billing and stops probing its own health.

Rule: an ops ritual (a monthly checklist in the ops doc) lists every scheduled workflow and its last run, and a
tripwire asserts that hand-written list equals the set of workflows carrying `schedule:` (see the `tripwire`
skill's patterns). The liveness check is itself scheduled, so the list includes it.

## Secret scanning

Gitleaks runs in the verify gate from a pinned, checksum-verified binary (download the release archive, verify
the published SHA-256, then run), not from a floating action. The allowlist is narrow and every entry carries a
comment saying why that match is safe (a fixture, a public test key). An entry without a reason fails review.

## A composite failure-issue action

Scheduled workflows that fail at 03:17 need a human to notice. A composite action in `.github/actions/failure-issue`
opens an issue titled after the workflow or comments on the open one, idempotently (search by title before
creating), with the run URL. Every `schedule:` workflow calls it in an `if: failure()` step.

## One reusable verify gate

A single `verify.yml` with `on: workflow_call` runs lint, typecheck, unit tests, tripwires, the migrate
rehearsal and secret scanning. The PR workflow calls it; each deploy workflow calls it before deploying. That
keeps the gate merge-queue-friendly (one required check) and stops deploy workflows from drifting away from what
PRs verify.

Sources: app-1 (CI workflows, ops doc); app-2 (contributor guide).

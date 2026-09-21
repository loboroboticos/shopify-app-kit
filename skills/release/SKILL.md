---
name: release
description: Drive a Shopify app release the way this repo's .claude/shopify-app.json allows it. Runs the release-readiness workflow, opens the promotion PR (never merges it), releases extensions with the deploy config or says the step is operator-only, explains how the server ships from its branch, scales to zero before migrating when required, and warns before any live billing action. Use when asked to release, promote, ship, deploy, or cut a version of the app, or when the operator wants a release checklist.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(git *), Bash(gh pr create *), Bash(gh pr view *), Bash(gh run *), Bash(jq *), Bash(shopify app deploy *), Bash(shopify app versions *), Bash(fly scale *), Bash(fly status *), Bash(curl *)
argument-hint: "[beta|extension|server]"
---

# shopify-app-kit release

Three surfaces: a promotion PR a human merges, an extension release through the CLI, a server release a workflow
performs on push. Never merge, never run a protected workflow by hand, never touch live billing.

## Steps

1. **Read the manifest.** From `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json` take `branches` (default,
   protected, promotion), `deploy` (targets, protectedWorkflows, scaleToZeroBeforeMigrate), `billing` (live,
   testFlag, method), `shopifyCli.configs.deploy`, `shopifyCli.deployPolicy`, `app.handles` and `paths.extensions`.

2. **Readiness.** Run `/shopify-app-kit:release-readiness` on the promotion range first. A `no-go` means do not
   open the PR: report the blockers and stop. Otherwise its checklist and verdict go into the PR body (step 3).
   For a public app (`billing.method` is `app-pricing`, or its distribution is the App Store) it also asks for the
   companion's `shopify-app-store-review` skill: run it and attach its summary, or say the companion is not installed.

3. **Promotion (`beta`).** Open the PR with the step 7 checklist (as the workflow pre-ticked it) as its body, then
   stop: `gh pr create --base <promotion.to> --head <promotion.from>`. The merge is the human gate; the kit's
   `guard-protected-branch` hook blocks `gh pr merge` and pushes to the protected branch, so do not try.

4. **Extension release (`extension`).** When `deployPolicy` is `operator-only`, say so and hand the command to
   the operator. Otherwise run `shopify app deploy --config <configs.deploy>`, then verify: a storefront page that
   renders the extension must carry the released slug `<handle>-<N>` for the production handle in `app.handles`
   in an asset URL; a dev handle there means the wrong registration deployed (`dev-loop`'s `cli-traps.md`).

5. **Server release (`server`).** The server ships when `deploy.targets.<t>.workflow` runs, dispatched by a push
   to its branch, never by `gh workflow run` (the guard blocks protected workflows). Say which branch to push or
   which PR to merge. When the release carries a migration and `deploy.scaleToZeroBeforeMigrate` is true, scale
   the app to zero before the migration step (`fly scale count 0 -a <target.fly>` or the platform's equivalent): a
   running app swallows webhooks mid-migration (`references/migrations-and-zero-downtime.md`; `guard-migrations` says so too).

6. **Billing.** When `billing.live` is true, say before any billing-related step that a subscribe, upgrade or
   plan change against the production registration is a real charge to a real merchant. The only agent-safe
   billing path is the test flag (`billing.testFlag`) under the dev registration (`references/billing-live-posture.md`).

7. **Checklist.** End with one the operator can paste into the PR (the workflow's block, or this one by hand):

   ```
   - [ ] CI green on <from>; migrate diff clean; tripwires green; release-readiness: go / go-with-notes
   - [ ] App Store review check (public app): summary attached / companion not installed
   - [ ] Migration in this release? scale to zero first (scaleToZeroBeforeMigrate): yes / no
   - [ ] Extension version to release: <handle>-<N>; verified in an asset URL after deploy
   - [ ] Server target(s): <workflow> on push to <branch>
   - [ ] Billing live: no plan or price change in this release / change reviewed
   - [ ] app dev clean run on the dev registration
   ```

## References

- `references/billing-live-posture.md`: test flag per environment, tier names are data, cache invalidation, the reconcile job, comp ledgers.
- `references/migrations-and-zero-downtime.md`: migrate rehearsal and drift check in CI, migrate through the branch, release command not boot, scale to zero.
- `references/ci-posture.md`: SHA pins, least privilege, concurrency, cron minutes, self-listing paths filters, scheduled-workflow liveness, secret scanning, failure-issue action, one verify gate.

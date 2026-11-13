# The review receipt

Class: rule. Every review a session runs on a branch with a PR leaves one machine-readable block in the PR body, and
the review gate (`hooks/kit-review-gate.yml`, vendored to `.github/workflows/`) fails a PR into `branches.default`
without a current one. `hooks/review-gate.mjs` (vendored to `.github/kit/`) owns the format: it parses, renders,
splices and checks it, and its tests are the specification. Never hand-edit the block; splice it.

## The block

````
<!-- shopify-app-kit:review-receipt -->
### Review receipt

```json
{ "v": 1, "kind": "pre-pr-review", "sha": "<40-hex HEAD reviewed>", "base": "main", "verdict": "approve",
  "confirmed": 0, "counts": { "blocker": 0, "major": 0, "minor": 2, "note": 1 },
  "roster": ["qa-review-security-governance", "..."], "models": { "qa-review-security-governance": "sonnet" },
  "independent": null }
```
<!-- /shopify-app-kit:review-receipt -->
````

- `kind`: a full review (`pre-pr-review`, `review`, `independent`) or a delta (`delta`, `independent-delta`).
- `confirmed`: blockers plus majors that survived the skeptic. `verdict` `block` fails the gate; `changes-needed`
  passes with a warning.
- A delta adds `fromSha` (the sha of the receipt it follows) and `chain` (that receipt's own chain plus that receipt,
  as `{ kind, sha, fromSha? }`), so the chain starts at a full review and every link is an ancestor of the head.
- `independent`: `null`, or the chain of independent reviews as `[{ "url", "sha" }]`: the first a full `independent`,
  the rest `independent-delta`, each URL `https://github.com/<owner>/<repo>/pull/<n>#pullrequestreview-<id>`.
- `reviewerSession` (optional): free text naming the session that reviewed, for the audit.
- The first opening marker starts the block; a second opening marker anywhere in the body fails the gate (quote the
  marker in prose without its `<!--`).

## Writing it

1. The review returns the receipt: `/shopify-app-kit:pre-pr-review` as `receipt` in its result; the `review` skill
   builds `{ v: 1, kind: "review", sha, base, verdict, confirmed, roster, models, independent: null }` itself.
2. Write it to a scratch file, then in the repo:
   `gh pr view <n> --json body --jq .body > body.md`,
   `node .github/kit/review-gate.mjs splice body.md receipt.json > new.md` (or `"${CLAUDE_PLUGIN_ROOT}/hooks/review-gate.mjs"`
   before the first sync), `gh pr edit <n> --body-file new.md`. `splice` refuses a malformed receipt and keeps the
   rest of the body byte for byte.
3. The sha is `git rev-parse HEAD` at review time, so push exactly what was reviewed before splicing.

## After a push: the delta

A fix pushed after the review makes the receipt stale. Re-run the reviewers on the fix commits only:
`/shopify-app-kit:pre-pr-review` with `{ "pr": <n>, "delta": { "receipt": <the body receipt>, "findings": "<the
earlier confirmed findings, one per line>" } }` (by default `qa-review-technical-integrity` and
`qa-review-security-governance`; `reviewers` overrides), then splice the result. A delta re-checks the fix commits
against the earlier findings; it is not a fresh full review, so a change of direction or a large new surface runs
the full roster again. On an `independentFor` path the independent chain must reach the head too:
`/shopify-app-kit:independent-review <n>` takes the delta path itself.

## The override

For an emergency only: the label `review-gate:override` plus a line `Review-gate override: <reason>` in the PR body.
The gate passes with a warning naming the reason and, on the run the label triggered, who applied it; the PR
timeline keeps the rest. Anyone who can label can override, so a `human:decision` follow-up issue records why.

Sources: app-1 (two high-risk PRs merged before the independent reviewer found a redirect loop; reviewer-model cost).

---
name: independent-review
description: Outsider review of a Shopify app PR that the review gate requires when review.independentFor paths change (billing, entitlement, webhooks, app tomls, Prisma, extensions). Runs the full review roster from the diff, the linked issue and the house rules only, adds an efficiency pass and an adversarial pass on the risky files, posts one COMMENT review carrying its receipt, and links it in the PR body's receipt. Use when a PR touching high-risk paths needs its independent review, or when asked to review someone else's PR as an outsider.
disable-model-invocation: true
allowed-tools: Read, Write, Grep, Glob, Bash(git *), Bash(jq *), Bash(node *), Bash(gh pr view *), Bash(gh pr edit *), Bash(gh issue view *), Bash(gh api *)
argument-hint: "<PR number>"
---

# shopify-app-kit independent-review

Independence here means a session without the author's context: run this from a session that did not write the
branch. Never read the author's transcript, plan file or PR body for intent; the reviewers see the diff, the linked
issue and the house rules. It posts one COMMENT review, never approves, requests changes or merges.

## Steps

1. **Scope.** `git rev-parse --show-toplevel` prints `<root>`. Check out the PR head
   (`gh pr view <n> --json headRefName,headRefOid,baseRefName`), `git fetch` it, and confirm `git rev-parse HEAD`
   equals `headRefOid`. Set `gate` to `<root>/.github/kit/review-gate.mjs`, or
   `${CLAUDE_PLUGIN_ROOT}/hooks/review-gate.mjs` before the first sync.
2. **Inputs, from the gate script.** `node <gate> models "<root>/.claude/shopify-app.json"` gives `models`;
   `git diff --name-only origin/<base>...HEAD | node <gate> touched "<root>/.claude/shopify-app.json"` gives the
   changed `independentFor` files.
3. **Delta or full.** Read the body receipt (`gh pr view <n> --json body`; the block is described in
   `${CLAUDE_PLUGIN_ROOT}/skills/review/references/receipt.md`). When its `independent` chain is non-empty and its
   last link's sha is an ancestor of HEAD, this run is a delta from that link: fetch that review's body
   (`gh api repos/{owner}/{repo}/pulls/<n>/reviews/<id>`), parse its receipt and its findings. Otherwise it is a full run.
4. **Run** `/shopify-app-kit:pre-pr-review` with `{ "pr": <n>, "independent": true, "all": true, "models": <models>,
   "independentFiles": [<files>], "reviewerSession": "<this session's id or name>" }`, plus `"delta": { "receipt":
   <that review's receipt>, "findings": "<its confirmed findings>" }` on a delta. The result carries `receipt`.
5. **Post one COMMENT review** on the reviewed commit: write the body (the verdict, at most ~10 findings with
   severity, path:line, claim, fix, then the receipt rendered by `node <gate> splice empty.md receipt.json` on an
   empty file) and run `gh api repos/{owner}/{repo}/pulls/<n>/reviews -f event=COMMENT -f commit_id=<HEAD sha>
   -F body=@review.md --jq .html_url`.
6. **Link it.** `gh pr view <n> --json body --jq .body > body.md`, then
   `node <gate> link body.md receipt.json <html_url> > new.md` and `gh pr edit <n> --body-file new.md`.
7. **Report** the verdict and the review link. When the body already had a receipt, `link` keeps it and its sha
   must still be HEAD (a stale self-review fails the gate even beside a fresh independent review); say so.

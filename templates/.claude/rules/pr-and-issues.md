---
paths:
  - ".github/**"
---

<!-- .claude/rules/pr-and-issues.md (shopify-app-kit template). The executor ladder of
     .github/ISSUE_TEMPLATE/work-item.md and the shape of a PR; reads branches.* from .claude/shopify-app.json. -->

# PRs and issues

- Every issue ticks one line of "Close condition needs". A session works only the rungs it can close: a PR
  (code only), `agent:ci` (an Actions run with an existing secret), `agent:cloud` (reaches the store, no login),
  `agent:local` (the maintainer's logged-in machine). A missing bootstrap links `Bootstrap: #__` and waits.
- A session never closes a `human:decision`, `human:account` or `human:legal` issue, and never does the work
  behind one (real charges, production data outside a guarded script, one-way Shopify choices, brand or legal
  text). It may prepare the PR and say what the human must do.
- Ticked lines from more than one group mean the issue is split before work starts.
- PRs target `branches.default`; `guard-protected-branch` blocks a push to or a merge into a protected branch.
  The promotion PR, when the repo has one, is opened by a session and landed by a human.
- A PR body says what changed, which manifest keys or ADRs it touches, whether a migration is destructive, and
  how it was verified. A destructive migration is acknowledged in the body or the reviewer blocks it.

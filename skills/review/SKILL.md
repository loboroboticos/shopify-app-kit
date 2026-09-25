---
name: review
description: Deep pre-merge review of a Shopify app branch. Runs the kit's correctness/security and code-quality review agents in parallel, each checking the diff against this repo's .claude/shopify-app.json, then synthesizes one verdict. Use when a branch or PR needs a harsh, thorough audit before merge or promotion, or when asked for a deep, thermonuclear or full review.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Agent, Bash(git *), Bash(jq *), Bash(gh pr *)
argument-hint: "[base-branch | PR number]"
---

# shopify-app-kit review

Two reviewers, one verdict. The correctness agent audits bugs, breakage, security and every manifest-declared
contract (auth, API version, webhooks, scopes, billing, database, deploy, devex). The quality agent audits
maintainability against the app's canonical layers. Both are diff-scoped and evidence-based; you dedupe and decide.

## Steps

1. **Scope.** Read `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json` (the manifest). If it is missing, say the
   review runs in generic mode and continue. Choose the base:
   - the argument, if it names a branch or a PR number (`gh pr view <n> --json baseRefName,headRefName,number,title,body`);
   - else `branches.promotion.to` when the current branch is `branches.promotion.from`;
   - else `branches.default`; else `main`.

   Collect, from the checkout: `git diff <base>...HEAD --stat`, `git diff <base>...HEAD`, the list of changed
   files, and the full contents of each changed file that is under about 400 lines (paths only for larger ones;
   the agents read those themselves). Note the PR number if one exists.

2. **Launch both agents in one message**, in the background, with the same context: the manifest JSON verbatim
   (or "none"), base, head and PR number, the diff, and the changed files (path, then contents or "read from
   checkout").

   - `subagent_type: "shopify-app-kit:review-correctness"` for bugs, breakage, security, manifest contracts, devex.
   - `subagent_type: "shopify-app-kit:review-quality"` for structure, spaghetti growth, file size, layers, conventions.
   - `subagent_type: "shopify-app-kit:classifier-reviewer"` **only when the manifest declares `classify`**, for the
     app's classification calls: declared label sets, per-call budgets, confidence-gated auto-action, text-only input.

   Ask each for prioritized findings with file:line evidence in its documented output format.

3. **Synthesize** once both return. Dedupe across reviewers; a finding both raised carries more weight. Resolve
   disagreements with your own reading of the code, and say when you overruled a reviewer and why. Verify any P0
   or blocking finding yourself before repeating it.

4. **Report**, briefly, never restating a reviewer wholesale: `## Verdict: block | changes-needed | approve`, the
   top findings (at most ~7: severity, path:line, claim, fix), one line per manifest section reviewed (ok or a
   finding reference), and one line per disagreement or uncertainty.

5. **Posting.** Only when the user asks, post the verdict to the PR (`gh pr comment`) or as a review; never
   approve or merge on their behalf.

## Notes

- Base selection follows the manifest so a promotion PR (`beta → main`) is reviewed against the right branch.
- The agents never edit files. Apply fixes afterwards, one finding at a time, re-running `checks.fileSize` and the
  tests in `checks.tripwireDir` before pushing. A finding under `.claude/hooks/kit/` means "re-run
  `/shopify-app-kit:sync`", not "edit the hook".
- For single-lens passes the kit ships a roster (the README's "Review roster"): `/shopify-app-kit:plan-review` on
  a plan, `/shopify-app-kit:pre-pr-review` on a diff, `/shopify-app-kit:release-readiness` on a promotion range.

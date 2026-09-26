# kit-tidy

The weekly routine that runs on the kit itself: it reports what the tests cannot express (prose duplicated across
files, things nothing reads, the size trend, docs that restate a test, the portfolio's kit versions) as issues, and
opens one PR per run for the purely mechanical drift a test already defines as wrong.

- **Cadence:** weekly (`37 5 * * 5`, Friday 05:37 UTC), in the kit repository only.
- **Environment:** a fresh cloud session in the kit's own environment with the checkout, `node`, the `claude` CLI
  and the GitHub MCP tools; read access to the repositories under the remote's owner for the portfolio step.
- **Tools:** `npm test`, the three `claude plugin validate` commands, git (read, plus one branch for the PR),
  `test/budget.json`, the repository listing and each product's manifest, issues and comments.
- **May touch:** new `kit-tidy:` issues (one of them `kit-tidy: deprecation candidates`), comments on open ones, one PR per run to `main` limited to mechanical
  drift (a drifted enumeration a mirror test names, a stale `# shopify-app-kit v` header, a README row for a file
  that exists).
- **Never:** pushes to `main`; deletes a file; edits a lesson row; changes a hook body, a schema or a test's
  assertion; closes a `human:*` issue; relabels `human:*` to `agent:*` except per R7; names a consumer, a store or
  a business anywhere (products are their `kit.portfolioId` only).

## Prompt

You are the weekly kit-tidy routine. This repository is the kit itself, not a consumer: it has no
`.claude/shopify-app.json`; its default and protected branch is `main`; its label set is `labels.json` at the
root. You report what the tests cannot express and fix only what a test already defines as wrong.

Ground rules, before anything else:

1. Derive the repository from the checkout's git remote (`git remote get-url origin`); nothing in this prompt
   names one. Read `labels.json`; its `ladder` array is the executor order.
2. This routine never closes a `human:*` issue and never relabels a `human:*` issue to `agent:*` or
   `code only` (rule R7 of the kit's issue-filing skill, whose `references/rules.md` you follow when filing).
3. At most one PR per run, from a branch, to `main`; it never pushes to `main`. The PR carries only mechanical
   drift (step 6) and its body names the test that defines each fix. Never a deletion, a lesson row, a hook body,
   a schema or a test assertion: those are issues for a maintainer.
4. Secrets and private names never appear in an issue, a comment or a PR: no store handle, business name,
   product name, owner login or consumer repository. A product is its `kit.portfolioId`. Before writing any
   issue, run `node --test test/no-repo-literals.test.mjs` over your draft text saved as a scratch file inside
   the checkout, and report a hit by its hash only.
5. Read `.claude/rules/kit.md` first: it states the posture every finding is judged against.

Step 1, the suite. Run `npm test` and the three `claude plugin validate` commands `.claude/rules/kit.md` lists.
A failure on `main` is one issue `kit-tidy: <the failing test in six words>`, `bug`, `code only`, `p1`, with the
failing assertion quoted; then continue.

Step 2, duplicated prose. Find passages of two or more sentences that appear near-verbatim (ignoring case,
whitespace and backticks) in more than one file under `skills/`, `agents/`, `routines/`, `templates/` and the
README. Ignore the routines' ground-rules block (deliberate: each prompt is pasted standalone) and the roster
agents' standing clause (asserted by the parity test). One issue per family, `code only`, `p3`, naming the
files and the owning one the others should point at.

Step 3, things nothing reads. Report, one issue per family, `code only`, `p3`: a manifest schema key no hook,
skill, workflow or routine reads (grep the key's dotted path); a fixture used by one test; a skill, agent or
workflow no workflow, routine, rule seed or README row names; a reference file linked only from its own skill's
index line with no step pointing at it.

Step 4, the size trend. Run `node --test test/budget.test.mjs` and read the headroom diagnostics; compute the
insert:delete ratio since the last tag (`git log <last tag>..HEAD --shortstat`). Both go into the summary as one
line each. An issue only when a directory is within 2% of its ceiling: `kit-tidy: <dir> is at <n> of <cap>`,
`code only`, `p3`, listing the three largest files in it.

Step 5, docs that restate a test. A sentence in the README, a `SKILL.md` or a reference that enumerates what a
test already asserts, or that states a number a constant defines, and that `test/docs-mirror.test.mjs` does not
yet cover: one issue per family across every file, `code only`, `p3`, with a table of one row per sentence (file
and line, the sentence quoted, the test or constant it restates). Never one issue per file.

Step 6, mechanical drift, the one PR. Anything a mirror or parity test names as wrong on `main` where the fix
is exactly what the test's message says (a drifted enumeration, a stale `# shopify-app-kit v` header, a README
row missing for a file that exists): fix it on a branch, run the suite, open one PR titled
`kit-tidy: <what drifted>` whose body names the test per fix. Nothing else rides it. No such drift: no PR.

Step 7, the portfolio. List the repositories under the remote's owner that this session can read; for each,
fetch `.claude/shopify-app.json` from its default branch and keep those carrying `kit.portfolioId`. For each
product: its id, `kit.version` against the kit's latest tag (`git describe --tags --abbrev=0`), the top-level
sections its manifest declares, and its `kit.routines`. One table in the summary, ids only. File nothing on a
consumer: that is `kit-health`'s job. When no repository is readable, say "portfolio: unverified".

Step 8, deprecation candidates. Only when step 7 found at least one product. Growth stays pull-driven only if
removal is too, so propose, never deprecate: (a) a manifest section or a guard-read key (the README's "Keys the
hooks read" table) that no discovered manifest declares; (b) a guard under `hooks/guard-*.sh` that no discovered
consumer registers in its `.claude/settings.json`; (c) a skill, agent or workflow from step 3 that nothing
names. A candidate is one that also appeared in the previous run's comment on the open
`kit-tidy: deprecation candidates` issue (the issue is the memory; the first sighting is a "seen once" line).
Comment the list on that issue, or open it, `code only`, `p3`, with the evidence per item and a pointer to
`kit-dev`'s "Remove a skill, agent, hook, workflow or routine". A maintainer decides; this routine deprecates
nothing and skips the step with "deprecation: unverified" when the portfolio is.

Filing. One open issue per family, titled `kit-tidy: <the finding in six words>`; search the open issues for
that title prefix first and comment on the match with this week's evidence instead of filing again. Labels as
above, plus an ROI bucket. Refer to other issues as a plain `#N`, never with a closing keyword.

Finish with a short summary in the session: the suite's verdict, the counts per step, the budget headroom and
the insert:delete ratio, the portfolio table, the deprecation candidates or "unverified", and the issues opened
or commented and the PR if any.

# Re-sync the review personas from upstream

The `design-review-*` and `qa-review-*` personas are ports of `.claude/agents/engine-*.md` from
`StarshipSuperjam/engine-template`, taken at the commit the CHANGELOG records (0.5.0 names the first one; a later
re-sync entry names the newest). The kit does not track upstream automatically: the `kit-health` routine reports
how many upstream persona files changed since that commit, and a maintainer ports the deltas by hand.

1. Shallow-clone upstream `main` into a scratch directory (`git clone --depth 50 --filter=blob:none
   <upstream url> /tmp/engine-template`), read the recorded commit from the CHANGELOG, and list what changed:
   `git -C /tmp/engine-template diff --stat <commit>..HEAD -- .claude/agents/`.
2. For each changed persona, diff its body against `agents/<name>.md` (the `engine-` prefix dropped) ignoring
   the frontmatter and the kit's rewritten language: upstream's review packet, digest, Build plan, `.engine/`
   state, grounding scout, orchestrator adjudication and JSON result contract read here as the plan file or PR
   description, `git diff origin/<branches.default>...HEAD`, the changed files, the manifest and `docs/adr/`.
   Compare the four headings (Mandate / How you work / What you produce / Boundaries) and the standing clause
   one section at a time; the CHANGELOG 0.5.0 port rules are the mapping.
3. Port the substantive deltas (a new check, a sharpened mandate, a removed boundary) in the persona's own voice;
   leave wording-only churn. Keep the frontmatter to the allowlist in `test/agents-parity.test.mjs`
   (`name, description, model, effort, maxTurns, tools, disallowedTools, skills, memory, background, omitClaudeMd,
   isolation`), `tools: Read, Grep, Glob, Bash`, `disallowedTools: Edit, Write, NotebookEdit`, and the findings
   shape every persona reports on (`blocker | major | minor | note`, claim, evidence, fix).
4. `node --test test/agents-parity.test.mjs` (headings, standing clause, "you report; the operator decides", no
   Engine machinery string), then the whole suite: `workflows/pre-pr-review.js`, `plan-review.js` and
   `release-readiness.js` launch these agents by name.
5. Record the new upstream commit in the CHANGELOG entry (`Re-synced from StarshipSuperjam/engine-template@<sha>`,
   with one line per persona that changed and what was ported) and bump the version.

Deliberately not ported, now as then: `engine-worker-builder` and `engine-worker-bounded` (they build; the kit's
agents are read-only), `engine-grounding-scout` and `engine-audit` (they depend on the Engine's memory servers
and Build-DAG packets), and `engine-validation-runner` (it runs the Engine's validation harness). Of these,
`validation-runner` is the candidate for a future `test-digest` agent that runs a consumer's `checks.*` suites
and digests the failures; the others stay out. No routine ports anything: `kit-health` only reports the delta.

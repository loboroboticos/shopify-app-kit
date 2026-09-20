# One owner per fact

## The rules

1. **One owning document per fact.** The docs map (an index at the top of the docs directory, or the docs
   section of CLAUDE.md) names, for every fact family (auth, webhooks, billing, deploy, dev loop, CI), the one
   document that states it. Edit the owner. Every other mention is a link to the owner and never a restatement.
2. **The map is tripwired.** A test asserts that every document in the docs directory is named in the map and
   every path the map names exists (the `tripwire` skill's docs-map pattern). A new doc that nobody indexed fails
   the PR.
3. **A reference doc states the current rule.** Not how it came to be, not when it last broke. Incidents, dates,
   run ids, commit shas and closed issue numbers belong in the PR description or in a dated history file. The
   docs-map tripwire also rejects dated headings in reference docs.
4. **Superseded text moves, it is not deleted.** When a rule changes, the old text goes to
   `docs/history/<YYYY-MM>-<topic>.md` with a one-line reason at the top. History files are never loaded by
   default and never linked from a rule.
5. **An issue number may trail a rule only while that issue is open.** "(tracked in #123)" is a promise that the
   rule is temporary. When the issue closes, the number leaves the doc in the same PR, or the rule becomes
   permanent and loses the parenthetical.
6. **A warning names its check.** Before adding "never X", find or write the hook, tripwire or CI step that
   enforces it and name that instead: "the `guard-shopify-cli` hook blocks `app deploy` without `--config`" is
   maintained by the hook's tests; "never run app deploy without --config" is maintained by nobody.
7. **Loading scope.** The always-loaded instructions file holds only lines a session needs most of the time
   and that no check enforces. Rules that matter only when certain paths are touched live in `.claude/rules/*.md`
   with a `paths:` frontmatter, so they load only then. Everything else is in the owning doc, one link away.

## The anti-pattern

An always-loaded instructions file that grows past a hundred kilobytes because every incident added a paragraph
and nothing was ever moved out. Each session pays the full context cost, the file contradicts itself in places
nobody re-reads, and the useful lines are buried. The cure is mechanical: for each paragraph, ask whether a check
enforces it (then delete it and name the check), whether it is path-specific (then move it to a path-scoped
rule), whether it is history (then move it to a dated file), and whether a session needs it most of the time
(then keep it). Most paragraphs fail all four.

## Kit consumers

For a repo that adopts this kit, the manifest (`.claude/shopify-app.json`) owns the tooling facts (configs,
branches, policies, pins, topics, targets), the vendored hooks enforce them, and the review agents check them.
A doc that restates a manifest value is a second owner; link the manifest key instead. Lessons the kit ships
(`lessons/INDEX.md`) are owned by the kit's reference files; a consumer's rules file seeds from them and points
back rather than copying the rationale.

Sources: app-1 (architecture doc, ops doc); app-2 (contributor guide); app-3 (ADR series).

---
name: docs-owner
description: Put a fact, rule or decision in the one document that owns it in a Shopify app repo, keep reference docs free of dates and incidents, replace warnings with the check that enforces them, and keep the always-loaded instructions file small. Use when editing CLAUDE.md, .claude/rules, an architecture or ops doc, an ADR, or when a review found the same fact stated in two places.
allowed-tools: Read, Grep, Glob, Write, Edit, Bash(ls *), Bash(cat *), Bash(wc *), Bash(node *)
---

# shopify-app-kit docs-owner

Documentation rots when the same fact lives in two places and only one gets updated. Every step below reduces the
number of places a fact can live. The full rule set is in `references/single-owner.md`; the shape of a decision
record is in `references/adr-shape.md`.

## Steps

1. **Read the manifest** at `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json` for `checks.tripwireDir` (where the
   docs-map tripwire lives, if the repo has one) and `paths` (so a rule can be path-scoped correctly).

2. **Find the owner before writing.** Open the repo's docs map (the index that names one owning document per
   fact family, usually at the top of the docs directory or in CLAUDE.md). Edit the owner. Every other mention of
   the fact points at the owner with a link and never restates it. If no owner exists, create the document and
   add it to the map in the same change (the map is tripwired for completeness where the repo has the check).

3. **State the current rule, not its history.** A reference doc says what is true now. Incident narratives,
   dates, run ids, commit shas and closed issue numbers go to the PR description or a dated history file
   (`docs/history/<YYYY-MM>-<topic>.md`). Superseded text moves to a history file with the date in its name
   rather than being deleted. An issue number may trail a rule only while that issue is open.

4. **Replace warnings with checks.** Before adding "never do X" to a doc, look in `checks.tripwireDir`, the vendored
   hooks and CI for something that already enforces it. If one exists, name the check instead of the warning. If
   none exists and the fact is checkable, write the check with the `tripwire` skill and name it.

5. **Choose the loading scope.** A line enters the always-loaded instructions file (CLAUDE.md) only when a session
   needs it most of the time and no check enforces it. Everything else goes to a path-scoped
   `.claude/rules/<topic>.md` (loaded only when its paths are touched) or the owning doc. If CLAUDE.md is growing,
   move before adding.

6. **Decisions get an ADR** only when they are significant, constraining, hard to reverse and had a real rejected
   alternative (`references/adr-shape.md`). Product decisions and tooling decisions live in separate series, each
   with an index of one row per record.

7. **Report** which document owns the fact now, which mentions became pointers, what moved to history, and which
   check (if any) replaced a warning.

## References

- `references/single-owner.md`: the ownership rules, the docs-map tripwire, issue numbers only while open, and
  the anti-pattern of an instructions file that grows past a hundred kilobytes.
- `references/adr-shape.md`: MADR-lite fields, when a decision earns a record, separate series, the index.

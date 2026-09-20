---
paths:
  - "docs/**"
  - "README.md"
  - "CLAUDE.md"
  - ".claude/rules/**"
---

<!-- .claude/rules/docs.md (shopify-app-kit template). Seeds from the kit's docs-* and adr-* lessons; reads
     docs.mapFile, docs.mapHeading and docs.adrDir from .claude/shopify-app.json. -->

# Docs

- One document owns each fact. Find the owner in the docs map (`docs.mapFile`, under `docs.mapHeading`) before
  writing; every other mention links to it and never restates it. A new file under `docs/` gets its row in
  the same PR (`test/docs-consistency.test.mjs` fails otherwise).
- Reference docs state the current rule and carry no dates, incidents, run ids or closed issue numbers. Dated
  text goes to `docs/history/<YYYY-MM>-<topic>.md`; the test rejects a dated heading in a reference doc.
- Before adding "never do X", name the hook, tripwire or CI step that enforces it, or write the check.
- CLAUDE.md stays under 200 lines and holds only what a session needs most of the time; mechanics go to a
  path-scoped file here in `.claude/rules/`.
- A decision that is significant, constraining, hard to reverse and had a real alternative gets a record in
  `docs.adrDir` (copy `0000-template.md`, next number, row in the index); a new number supersedes, nothing is
  edited into a different decision.

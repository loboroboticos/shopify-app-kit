<!-- docs/adr/README.md (shopify-app-kit template)
     The decision index. The manifest names this directory as docs.adrDir; test/docs-consistency.test.mjs fails
     when a record here has no row below. -->

# Architecture decision records

One decision per file, `NNNN-kebab-title.md`, copied from `0000-template.md`. MADR-lite: frontmatter `status`,
`date`, `deciders`; sections Context, Decision, Consequences. The date is allowed here and nowhere else in the
reference docs: a decision record is a dated record by definition.

Rules:

- A decision earns a record only when it is significant, constraining, hard to reverse and had a real rejected
  alternative. Anything else is a rule in the owning doc or a line in the PR description.
- Numbers only go up. To change a decision, write a new record with the next number and set the old record's
  `status` to `superseded by NNNN`; the newest number wins. Records are never edited into a different decision
  and never deleted.
- The row below is the only index. A superseded record keeps its row with the new status.
- Before Phase 1 a new app writes one record per entry in `SEEDS.md`, even when the answer is the family
  default, so the alternative rejected is on file.

## Index

| Number | Title | Status | Date |
| --- | --- | --- | --- |
| 0000 | Template | n/a | n/a |

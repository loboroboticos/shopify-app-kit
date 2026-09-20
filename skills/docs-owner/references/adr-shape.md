# Architecture decision records, MADR-lite

## The shape

One file per decision, `docs/adr/NNNN-<slug>.md`, with exactly these sections:

```markdown
# NNNN. <Title, an imperative sentence: "Use RLS for tenant isolation">

- Status: proposed | accepted | superseded by NNNN
- Date: YYYY-MM-DD

## Context
What forced the decision: the constraint, the failure, the deadline. Two paragraphs at most.

## Decision
What was decided, in the present tense, with the mechanism named (the library, the table, the workflow).

## Consequences
What becomes easier, what becomes harder, what must now be maintained.

## Alternative rejected
The one serious alternative and why it lost. If there was none, this was not a decision worth a record.
```

The date is allowed here: an ADR is a dated record by definition. It is the one document type where the
`docs-owner` no-dates rule does not apply.

## When a decision earns a record

All four, or no ADR:

1. **Significant**: it shapes how more than one module is written.
2. **Constraining**: it rules something out for future work.
3. **Hard to reverse**: undoing it is a migration, a re-registration or a rewrite, not a PR.
4. **Had a real rejected alternative**: someone could reasonably have chosen otherwise.

A decision that fails any of these goes in the owning doc as a rule, or in the PR description.

## Two series

Product decisions (what the app does for merchants, pricing structure, what data it keeps) and tooling
decisions (framework, database isolation model, hosting, CI shape, auth substrate) are read by different people
at different times. Keep them in separate directories with separate numbering (`docs/adr/product/`,
`docs/adr/tooling/`), so a reader looking for "why RLS" does not scroll past "why three tiers".

## The index

Each series keeps `README.md` with one row per record: number, title, status, date. The docs-map tripwire
asserts that every ADR file has a row and every row has a file. A superseded record keeps its row with the
status pointing at its successor; records are never deleted.

## Seeds for a new app

The kit's lessons index (`lessons/INDEX.md`) marks some lessons `adr-seed`: decisions every new Shopify app in
this family must take before the first install (distribution type, registration model, tenant isolation, webhook
intake shape). A new repo starts its tooling series by writing one record per seed, even when the answer is the
family default, so the alternative rejected is on file.

Sources: app-3 (ADR series, multi-tenant rebuild plan); app-2 (contributor guide).

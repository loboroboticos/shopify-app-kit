# Lessons

What the consumer apps taught the kit, extracted into the skills' reference files and indexed in `INDEX.md`.
The index is the catalogue; the reference files are the text. Nothing here restates a lesson.

## Extraction discipline

- **One owner per fact.** A lesson lives in exactly one reference file under `skills/<skill>/references/`, or in
  a review agent's checklist. `INDEX.md` points at that home with a heading anchor; it never carries the text.
  A lesson that two skills need is written once and linked from the other.
- **Every lesson cites a source** by the neutral labels below and never by name. The `no-repo-literals` test
  rejects store handles, client ids, hosting app names and business names anywhere in the kit.
- **A lesson enters only if a session needs it more than once.** A one-off incident stays in the source repo's
  history. A rule that has bitten twice, or once in two repos, is extracted.
- **Written generically.** A lesson names manifest keys, CLI flags, platform behaviours and file shapes; never a
  particular app, store, plan name or deployment.
- **A row lives while something reads it.** Every row in the live table is cited by id from an artifact a
  session reads: a `SKILL.md`, an agent, a template rule seed, a workflow, a routine prompt. A reference file
  needs no row to exist (its `SKILL.md` links it); a row exists only because something pulls on it.
- **Rows nothing cites, or that no longer hold, move to the dated history section** at the bottom of `INDEX.md`
  (`## History`, one dated subsection per removal, the rows with a `reason` column). Rows are never deleted, and
  a History row returns to the live table when something cites it again.

## Classes

| Class | Meaning | Where a consumer puts it |
| --- | --- | --- |
| `rule` | a constraint the code or repo must satisfy | copied into the consumer's `.claude/rules/*.md` seeds, pointing back at the home |
| `recipe` | a step a skill performs | invoked through the owning skill; not copied |
| `lens` | a check a review agent runs | the `review` skill's agents already carry it; not copied |
| `adr-seed` | a decision a new app must take before its first install | one record per seed in the new app's tooling ADR series (`skills/docs-owner/references/adr-shape.md`) |

## Sources

The only way to cite, and the tests read the allowed set from this table's first column. A source is a
product's `kit.portfolioId` (an opaque id, never a name); the three `app-N` labels below are the founding
sources, kept for the rows in History. Add a row here when a product first contributes a lesson.

| Label | What it is | Documents drawn on | Period |
| --- | --- | --- | --- |
| `app-1` | a live single-merchant storefront-extension app: hosted admin plus theme app extension, Billing API live, beta/main promotion model | architecture doc, ops doc, pricing doc, CI workflows, dev-toml header | 2026-08 to 2026-09 |
| `app-2` | a single-tenant operations dashboard with an MCP connector: Next.js, custom app, webhooks | contributor guide | 2026-06 to 2026-09 |
| `app-3` | a multi-tenant rebuild plan and its ADR series: RLS Postgres, webhook intake, MCP auth substrate | rebuild plan, ADR series | 2026-06 to 2026-07 |

## Adding a lesson

A lesson enters through the lesson-proposal issue template (`.github/ISSUE_TEMPLATE/lesson-proposal.md`): the
rule, the failure, where it bit (portfolio ids, twice in one product or once in two), the proposed home and
class, and the artifact that will cite it. The landing procedure is `kit-dev`'s "Add a lesson"
(`skills/kit-dev/references/add.md`), which this file does not repeat.

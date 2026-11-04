# Lessons

What the consumer apps taught the kit lives as text in the skills' reference files and the review agents; this
file holds only the discipline and the source labels. Nothing here restates a lesson.

## Extraction discipline

- **One owner per fact.** A lesson lives in exactly one reference file under `skills/<skill>/references/`, or in
  a review agent's checklist. A lesson that two skills need is written once and linked from the other.
- **Every lesson cites a source** by the neutral labels below and never by name. The `no-repo-literals` test
  rejects store handles, client ids, hosting app names and business names anywhere in the kit.
- **A lesson enters only if a session needs it more than once.** A one-off incident stays in the source repo's
  history. A rule that has bitten twice, or once in two repos, is extracted.
- **Written generically.** A lesson names manifest keys, CLI flags, platform behaviours and file shapes; never a
  particular app, store, plan name or deployment.
- **A lesson lives while something reads it.** Its home is linked from a `SKILL.md` or is an agent section; a
  lesson nothing sends a session to is removed through `kit-dev`'s procedures, and `git log` keeps it.

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
sources. Add a row here when a product first contributes a lesson.

| Label | What it is | Documents drawn on | Period |
| --- | --- | --- | --- |
| `app-1` | a live single-merchant storefront-extension app: hosted admin plus theme app extension, Billing API live, beta/main promotion model | architecture doc, ops doc, pricing doc, CI workflows, dev-toml header | 2026-08 to 2026-09 |
| `app-2` | a single-tenant operations dashboard with an MCP connector: Next.js, custom app, webhooks | contributor guide | 2026-06 to 2026-09 |
| `app-3` | a multi-tenant rebuild plan and its ADR series: RLS Postgres, webhook intake, MCP auth substrate | rebuild plan, ADR series | 2026-06 to 2026-07 |

## Adding a lesson

A lesson enters through the lesson-proposal issue template (`.github/ISSUE_TEMPLATE/lesson-proposal.md`): the
rule, the failure, where it bit (portfolio ids, twice in one product or once in two), the proposed home and
class, and the artifact that will send a session to it. It lands as text in that home, the home's `Sources:` line
updated, with a version bump.

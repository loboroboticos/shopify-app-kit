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
- **Superseded lessons move to a dated history section** at the bottom of `INDEX.md` (`## History`, one dated
  subsection per removal, with the id, the old rule and why it no longer holds). Rows are never silently deleted.

## Classes

| Class | Meaning | Where a consumer puts it |
| --- | --- | --- |
| `rule` | a constraint the code or repo must satisfy | copied into the consumer's `.claude/rules/*.md` seeds, pointing back at the home |
| `recipe` | a step a skill performs | invoked through the owning skill; not copied |
| `lens` | a check a review agent runs | the `review` skill's agents already carry it; not copied |
| `adr-seed` | a decision a new app must take before its first install | one record per seed in the new app's tooling ADR series (`skills/docs-owner/references/adr-shape.md`) |

## Sources

The only way to cite. Never expand these labels into names.

| Label | What it is | Documents drawn on | Period |
| --- | --- | --- | --- |
| `app-1` | a live single-merchant storefront-extension app: hosted admin plus theme app extension, Billing API live, beta/main promotion model | architecture doc, ops doc, pricing doc, CI workflows, dev-toml header | 2026-08 to 2026-09 |
| `app-2` | a single-tenant operations dashboard with an MCP connector: Next.js, custom app, webhooks | contributor guide | 2026-06 to 2026-09 |
| `app-3` | a multi-tenant rebuild plan and its ADR series: RLS Postgres, webhook intake, MCP auth substrate | rebuild plan, ADR series | 2026-06 to 2026-07 |

## Adding a lesson

1. Decide the class and the owning reference file (or extend an existing section of it).
2. Write the section: the rule in the present tense, the mechanism, the failure it prevents. End the file's
   `Sources:` line with the labels it now draws on.
3. Add one row to `INDEX.md` with a new id in that file's prefix series, a one-line rule, the class, the home
   as `skills/<skill>/references/<file>.md#<heading-anchor>` (or `agents/<agent>.md#<anchor>` for a lens), and
   the source labels.
4. Run `node --test test/lessons-index.test.mjs`: every home must exist, every anchor must match a heading, every
   reference file must be the home of at least one lesson, and ids must be unique.
5. Bump the kit version (`skills/kit-dev/SKILL.md`); reference files are plugin-visible.

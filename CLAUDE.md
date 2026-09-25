# shopify-app-kit

A Claude Code plugin for sessions that build Shopify apps. The repo root is the plugin root and its own
marketplace. Everything here is generic: a consumer's facts live in its own `.claude/shopify-app.json`.

## The posture

- One source of truth per fact, kept honest by a test or a generator; never a second copy in prose.
- An addition names the consumer evidence that pulled it. A feature nobody asked for stays out.
- Removal is a first-class procedure (deprecate in one minor, delete in the next); the size budget in
  `test/budget.json` only ratchets down.

## Private names never land here

No store handle, business name, product name, owner login or consumer repository appears in a file, a commit
message, an issue, a PR or a comment. `test/no-repo-literals.test.mjs` is the tripwire; it matches the private
terms by hash, so they never appear in the kit either. Refer to a consumer as "a consumer" or by its portfolio id.

## Commands

```bash
npm test                              # node --test "test/**/*.test.mjs", zero dependencies
claude plugin validate . --strict
```

Every change under `skills/`, `agents/`, `hooks/`, `workflows/`, `schemas/`, `lessons/` or `.claude-plugin/`
bumps the version and gets a CHANGELOG line; `routines/`, `templates/`, `test/` and the root files do not.

For every procedure (add, remove, re-sync the personas, release): `/shopify-app-kit:kit-dev`.

# shopify-app-kit

A Claude Code plugin for developer sessions that build Shopify apps. It ships generic tooling only: guard hooks
that read a per-repo manifest, skills, and (later) review agents and workflows. Nothing in this repo knows about
any particular app, store or hosting account; every repo-specific fact lives in the consumer's
`.claude/shopify-app.json`.

The repo root is the plugin root and its own marketplace.

## What you get

| Component | What it does |
| --- | --- |
| `/shopify-app-kit:review` | Deep pre-merge review: the two agents below run in parallel on the branch diff, each checking it against the manifest, and the skill synthesizes one verdict. |
| `agents/review-correctness.md` | Bugs, breakage, security and devex, plus every manifest contract: auth boundaries, API version pins, webhook coverage and compliance, scopes, CLI configs, protected workflows, billing test flag, shop-scoped queries and migrations. |
| `agents/review-quality.md` | Harsh maintainability review against the app's canonical layers (Shopify server module, thin routes, one GraphQL home, per-topic webhooks, shop-scoped data layer), file-size limit from `checks.fileSize`, spaghetti growth, code-judo simplifications. |
| `hooks/guard-shopify-cli.sh` | PreToolUse guard for `shopify app dev`, `shopify app deploy`, `shopify app config use`, `<pm> run deploy` and `shopify theme dev`, driven by the manifest's `shopifyCli` policies. Fails closed when the manifest or `jq` is missing. |
| `hooks/lib.sh` | Shared bash the guards source: manifest resolution, block messages, path normalisation, heredoc stripping, command splitting with `cd` tracking. |
| `hooks/doctor.sh` | SessionStart briefing: validates the manifest structurally, prints the app facts, reports vendored-hook drift. Silent in repos without a manifest. |
| `/shopify-app-kit:doctor` | Same checks, on demand, plus settings-registration drift. |
| `/shopify-app-kit:sync` | Vendors the guards into the consumer and records the kit version in the manifest. |
| `/shopify-app-kit:kit-dev` | Maintainer guide for this repo. |
| `schemas/shopify-app.v1.schema.json` | The manifest contract (JSON Schema, draft 2020-12). |

## Adopting the kit in an app repo

1. Pin the plugin from the repo's `.claude/settings.json`:

   ```json
   {
     "extraKnownMarketplaces": {
       "shopify-app-kit": {
         "source": { "source": "github", "repo": "loboroboticos/shopify-app-kit" }
       }
     },
     "enabledPlugins": {
       "shopify-app-kit@shopify-app-kit": true
     }
   }
   ```

   The repository is public, so the pin resolves from any session or CI without a token. A project pin registers the
   marketplace but does not install the plugin until `claude plugin install` has run once, so a consumer that runs in
   cloud sessions adds a repo-owned SessionStart hook (see a consumer's `.claude/hooks/kit-bootstrap.sh`) that installs
   it when absent; the vendored guards fire either way.

2. Write `.claude/shopify-app.json` (see the manifest contract below; start from
   `test/fixtures/manifests/npm-root-app.json` or `pnpm-root-app.json`).

3. Run `/shopify-app-kit:sync`. It copies `hooks/lib.sh` and `hooks/guard-*.sh` into `.claude/hooks/kit/`, sets
   `kit.version` in the manifest, and prints the `hooks.PreToolUse` snippet to add to `.claude/settings.json`:

   ```json
   {
     "hooks": {
       "PreToolUse": [
         {
           "matcher": "Bash",
           "hooks": [
             { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/kit/guard-shopify-cli.sh\"" }
           ]
         }
       ]
     }
   }
   ```

   Guards are vendored on purpose: they fire from the consumer's own settings even when the plugin has not
   loaded (fresh clone, offline marketplace). The plugin's `hooks/hooks.json` registers only the SessionStart doctor.

4. Commit `.claude/shopify-app.json`, `.claude/hooks/kit/` and `.claude/settings.json`. Run `/shopify-app-kit:doctor`
   in a new session; it should report no drift.

Upgrading: bump nothing in the consumer, just re-run `/shopify-app-kit:sync` after the kit tags a new version.
The doctor flags hook headers whose `# shopify-app-kit vX.Y.Z` line no longer matches `kit.version`.

## The manifest contract

`.claude/shopify-app.json`, schema v1. The top level is closed (`additionalProperties: false`); sections grow
additively. Required sections: `kit`, `app`, `shopifyCli`, `branches`, `packageManagers`. Two optional metadata keys
are also allowed at the top level: `$schema` (a URL to this schema, for editors) and `$comment` (a free-text note);
the hooks ignore both.

```json
{
  "kit": { "schemaVersion": 1, "version": "0.1.0" },
  "app": { "name": "Example App", "kind": "embedded-app", "handles": { "prod": "example-app", "dev": "example-app-dev-1" } },
  "shopifyCli": {
    "configs": { "dev": "example-dev", "deploy": "example" },
    "requireConfigFlag": true,
    "devPolicy": "config-required",
    "deployPolicy": "config-required",
    "configUsePolicy": "allowed",
    "themeDevFromRoot": "block"
  },
  "branches": { "default": "beta", "protected": ["main"], "promotion": { "from": "beta", "to": "main" } },
  "packageManagers": { ".": "npm", "web": "pnpm" },
  "paths": { "server": "web", "shopifyServer": "web/app/shopify.server.ts", "appTomls": ["shopify.app.example.toml"] },
  "apiVersion": { "expected": "2026-07", "pins": ["web/app/shopify.server.ts"] },
  "webhooks": { "topics": ["app/uninstalled", "app/scopes_update"], "compliance": true },
  "scopes": { "required": ["read_products"], "optional": [] },
  "deploy": { "targets": { "prod": { "fly": "example-app", "flyToml": "web/fly.toml", "workflow": "deploy.yml" } }, "protectedWorkflows": ["deploy.yml"] },
  "billing": { "live": true, "testFlag": "BILLING_TEST" },
  "database": { "provider": "prisma-postgres", "rls": false },
  "checks": { "tripwireDir": "test/claude" }
}
```

Keys the hooks read:

| Key | Values | Effect |
| --- | --- | --- |
| `kit.schemaVersion` | `1` | Guards refuse to run (fail closed) unless this is `1`. |
| `kit.version` | string or `null` | Set by `sync`; compared with the vendored hooks' headers. |
| `shopifyCli.devPolicy` | `config-required` / `operator-only` / `allowed` | `shopify app dev [clean]` must carry `--config <configs.dev>` / is blocked outright / passes. |
| `shopifyCli.deployPolicy` | same enum | `shopify app deploy` must carry `--config <configs.deploy>` / is blocked outright / passes. `npm|pnpm|yarn|bun run deploy` (and `pnpm deploy`) is blocked unless `allowed`. |
| `shopifyCli.configUsePolicy` | same enum | `shopify app config use X`: X must be a manifest config / blocked outright / passes. |
| `shopifyCli.configs.{dev,deploy}` | config names | Required when the matching policy is `config-required`. A `--config` value that differs from the manifest is blocked: a wrong config is worse than a missing one. |
| `shopifyCli.themeDevFromRoot` | `block` / `allow` | `shopify theme dev` whose effective directory (after `cd` / `--path`) is the repo root is blocked. A `cd` to a non-literal path before it fails closed. |
| `packageManagers` | `{ "<dir>": "npm" \| "pnpm" }` | Read by the doctor now; the package-manager guard arrives in a later version. |

`operator-only` blocks tell the session to ask the maintainer to run the command from their terminal.
Block messages start with `Blocked by shopify-app-kit/<hook>:` and end with
`Cases: shopify-app-kit test/hooks.test.mjs (vX.Y.Z).` so a consumer can trace any block to a test case.

Manifest lookup order: `$SHOPIFY_APP_KIT_MANIFEST`, then `$CLAUDE_PROJECT_DIR/.claude/shopify-app.json`, then the
nearest `.claude/shopify-app.json` walking up from the command's working directory. The consumer root is the
manifest's grandparent (or `$SHOPIFY_APP_KIT_ROOT` / `$CLAUDE_PROJECT_DIR` when the manifest lives elsewhere).

## Reviewing a branch

`/shopify-app-kit:review [base | PR number]` picks the base from the manifest (`branches.default`, or
`promotion.to` when you are on the promotion branch), gathers the diff, and launches `review-correctness` and
`review-quality` in parallel with the manifest, diff and changed files in their prompts. Each returns prioritized
findings with file:line evidence; the skill dedupes them and reports one verdict (`block`, `changes-needed`,
`approve`) with a per-section manifest checklist. The agents are read-only and never post to the PR unless asked.

The manifest is what makes the review specific: the correctness agent knows which files must pin
`apiVersion.expected`, which webhook topics need handlers, which scopes are allowed, whether billing is live,
whether queries must be shop-scoped by hand, and which workflows are protected. The quality agent knows where the
app's canonical layers live and what file-size limit `checks.fileSize` enforces. Sections missing from the manifest
are skipped, and without a manifest the review runs in generic mode.

## The three-plugin rule

Each app has up to three plugins, and they never mix:

1. **This kit** (developer-facing): guard hooks, skills, review agents used by sessions that write the app's code.
   Generic, versioned, shared across apps.
2. **The app's operator plugin** (a separate repo per app): what the app's operator runs day to day. It may embed
   store-specific facts; the kit must not.
3. **The app repo's own `.claude/`**: the manifest, the vendored guards, repo-local skills and tripwires.

A test (`test/no-repo-literals.test.mjs`) fails the kit's CI on store handles, client ids, hosting app names or
business names, so operator or repo facts cannot leak into the kit.

## Developing the kit

```bash
node --test "test/**/*.test.mjs"     # or: npm test
claude plugin validate . --strict
claude --plugin-dir .                # /shopify-app-kit:doctor should be listed
```

See `/shopify-app-kit:kit-dev` (skills/kit-dev/SKILL.md) for how to add hooks, skills and agents, and how to
release. Any change under `skills/`, `agents/`, `hooks/`, `workflows/`, `schemas/`, `.mcp.json` or `.claude-plugin/`
needs a version bump; CI checks it on PRs to `main`.

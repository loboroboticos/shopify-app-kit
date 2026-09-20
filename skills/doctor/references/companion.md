# The companion plugin

Two plugins sit in every consumer session and they never overlap: Shopify's official `shopify-ai-toolkit`
(`claude plugin install shopify-ai-toolkit@claude-plugins-official`) and this kit. The doctor reports when the
companion is missing and when its telemetry is on; nothing in the kit depends on it being there.

## The split

The companion answers "what does the platform do": Admin API docs and schema search with GraphQL validation
(`shopify-dev`), the Admin API and custom data skills (`shopify-admin`, `shopify-custom-data`), pricing
(`shopify-app-pricing`), the pre-submission compliance check (`shopify-app-store-review`), the CLI reference
(`shopify-use-shopify-cli`), Polaris for the app home (`shopify-polaris-app-home`) and the rest of its
twenty-odd skills. It knows nothing about a particular repo.

The kit answers "what does this repo's manifest require": the facts in `.claude/shopify-app.json` and the
guard hooks that enforce them, the doctor, the review roster and its workflow, the lessons, the scaffold and
its templates, and the app-layered Shopify data the companion cannot know (app-owned metafields and
metaobjects, the `$app:` accessors, the entitlement write path and its cache contract).

Rule: a kit skill calls the companion for platform facts and says "unverified" without it; it never restates
platform documentation, and the companion never reads the manifest.

## Where the kit's skills use it

- `admin-api`, step 4: the companion's `shopify-dev` skill confirms every field, mutation, input type and
  webhook topic exists in `apiVersion.expected`; without it the change stays minimal and is reported as
  unverified.
- `dev-loop`: the companion's `shopify-use-shopify-cli` is the CLI reference; the `--config` discipline and
  `app dev clean` stay in the kit because they come from the manifest and the shared-registration trap.
- `release`: for a public app, the companion's `shopify-app-store-review` runs before the promotion PR and its
  summary goes into the PR body.

## Install and opt out

The templates' `.claude/hooks/kit-bootstrap.sh` installs both plugins in a remote session and writes the
telemetry opt-out; `.claude/settings.json` enables both. Locally the maintainer installs deliberately. The
companion's hooks are telemetry only; the opt-out file is `~/.config/shopify-ai-toolkit/opt-out`
(`mkdir -p ~/.config/shopify-ai-toolkit && touch ~/.config/shopify-ai-toolkit/opt-out`). The doctor prints
one line for each condition and never blocks; when the `claude` binary is absent it says nothing.

Sources: app-1 (dev-toml header and ops doc: the Dev MCP for schema checks, the manifest for repo facts); app-3 (rebuild plan: app-owned data and entitlement path as the app's own layer).

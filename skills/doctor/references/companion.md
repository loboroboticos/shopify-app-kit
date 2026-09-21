# The companion plugins

Three things sit in every consumer session and they never overlap: Shopify's official `shopify-ai-toolkit`
plugin (`claude plugin install shopify-ai-toolkit@claude-plugins-official`), the graphify skill (a pip package,
see below) and this kit. The doctor reports when a companion is missing and when the Shopify one's telemetry
is on; nothing in the kit depends on either being there.

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

## The graph companion

`graphify` (Graphify-Labs, MIT) turns the checkout into a queryable knowledge graph and writes `graphify-out/`
(`graph.html`, `GRAPH_REPORT.md`, `graph.json`, a content-hash cache). It is not a Claude Code plugin: its
README installs the PyPI package `graphifyy` (the CLI and the skill command are `graphify`) and then
`graphify install` registers the skill under `~/.claude/skills/graphify/` (or `$CLAUDE_CONFIG_DIR`), so the
bootstrap hook runs `pip install graphifyy==<pin> && graphify install` (or `uv tool install` / `pipx` when
present) pinned to the release the doctor names. Its `/graphify .` gives a session the structure of a codebase
in far fewer tokens than reading it.

The kit covers what graphify does not: the `graphify-refresh` routine rebuilds the graph weekly and commits
`graphify-out/` on the `graph/` branch only (force-with-lease on that branch, never the default branch), so
every session can start from a current map; `graphify-out/` is listed in the templates' `.claudeignore` and
belongs in the consumer's `.gitignore`, so a local rebuild neither lands on the default branch nor invalidates
the prompt cache. The doctor prints one line when the skill is absent; the routine skips when it is.

## Install and opt out

The templates' `.claude/hooks/kit-bootstrap.sh` installs the kit, the Shopify companion and graphify in a
remote session and writes the telemetry opt-out; `.claude/settings.json` enables both plugins. Locally the
maintainer installs deliberately. The Shopify companion's hooks are telemetry only; the opt-out file is
`~/.config/shopify-ai-toolkit/opt-out` (`mkdir -p ~/.config/shopify-ai-toolkit && touch
~/.config/shopify-ai-toolkit/opt-out`). The doctor prints one line for each condition and never blocks; when
the `claude` binary is absent it says nothing.

Sources: app-1 (dev-toml header and ops doc: the Dev MCP for schema checks, the manifest for repo facts; the graph branch convention); app-2 (contributor guide: what stays out of the prompt cache); app-3 (rebuild plan: app-owned data and entitlement path as the app's own layer).

# Shopify CLI traps around `app dev`

Four ways a routine dev session damages a registration that is shared with a hosted environment, and the rule
that closes each one. All four come from the same root: the CLI mutates the registration it is pointed at, and
which registration that is depends on state the command line does not show.

## Trap 1: the implicit default config

`shopify app config link` writes `shopify.app.<name>.toml` and makes the last-linked config the implicit default
for the repo. From then on a bare `shopify app dev` or `shopify app deploy` targets whichever toml was linked
last, which is invisible in the command and changes whenever anyone links another config.

Rule: every `app dev`, `app deploy` and `app config use` carries `--config <name>` (the manifest's
`shopifyCli.configs.dev` or `configs.deploy`; the kit's `guard-shopify-cli` hook blocks the command otherwise).
Consider keeping no plain `shopify.app.toml` at all, so a config-less command has nothing to fall back on and
fails instead of guessing.

## Trap 2: `automatically_update_urls_on_dev`

Each toml carries `[build] automatically_update_urls_on_dev`. When it is `true`, `app dev` rewrites the
registration's `application_url` and redirect URLs to the tunnel without asking. On the production toml that
means one accidental `app dev --config <prod>` takes the live app down until someone restores the URLs.

Rule: `automatically_update_urls_on_dev = false` on the production toml, so an accidental `app dev` prompts
instead of rewriting; `true` only on the dev toml, where rewriting is the point. The review agents check the
tomls named in `paths.appTomls` for this.

## Trap 3: the quick tunnel expires silently

`app dev` opens a Cloudflare quick tunnel per run. The hostname is new every run and the tunnel expires after
roughly three hours whether or not the process is still alive. A dead tunnel presents as an app outage: the
admin embed fails to load and webhook deliveries to the tunnel URL fail with retries.

Rule: treat a dev session as a lease of about three hours. When the embed stops loading mid-session, restart
`app dev` (which opens a new tunnel and re-points the URLs) rather than debugging the app. Never rely on a tunnel
URL in anything that outlives the session (a webhook subscription written by hand, a note in an issue).

## Trap 4: ending without `app dev clean`

The URL rewrite from trap 2 is not undone when the process exits. When the dev registration also serves a hosted
dev or beta deployment (same client id), that deployment now points at a tunnel that no longer exists.

Rule: `shopify app dev clean --config <configs.dev>` at the end of every session, including after a crash or a
cancelled command. `clean` restores the registration's URLs from the toml. If the session cannot run it (the
command was blocked, the shell died), say so explicitly so the maintainer runs it.

## Handles and released versions

An extension's released version is visible in rendered storefront asset URLs as `<handle>-<N>`, and a probe that
checks "is version N live" greps for that slug. A dev extension whose handle shares the production handle's
prefix (`example-app` and `example-app-dev`) lets a probe mistake a dev release for a production one, or the
reverse.

Rule: dev handles do not share the production handle's prefix (`example-app` vs `sandbox-example`), so a slug
match can only ever mean one registration. Record both handles in the manifest under `app.handles`.

Sources: app-1 (dev-toml header, ops doc); app-2 (contributor guide).

# Distribution is one-way

Decisions about a Shopify app registration that cannot be undone, and what each forces on the code.

## Custom vs public is locked at creation

A registration's distribution type (custom, installed on one store or one organisation's stores, versus public,
listed on the App Store) is chosen when the registration is created and cannot be changed. There is no
conversion. Going public later means a brand-new registration with a new `client_id`; every existing install
re-installs under it, with a new OAuth grant, new sessions, new webhook subscriptions and a new billing history.

Rule: plan the registration model before the first install. Encode the distribution in the manifest
(`app.kind`: `custom-app` versus `embedded-app`) so the review agents and skills know which constraints apply.

## Custom distribution cannot bill through Shopify

A custom-distribution app cannot charge merchants through Shopify at all: neither the Billing API nor App Pricing
is open to it, so any charge is settled outside Shopify. A public app chooses either App Pricing (plans hosted by
Shopify, no subscription webhooks) or the Billing API (subscription mutations in code, `app_subscriptions/update`
handled, test versus live decided by the app, the whole of the `release` skill's `billing-live-posture.md`).
Rule: a paid app is a public app; record the choice in `billing.method` before the first paid install.

## One process serves one registration

The app framework reads the api key and secret at import time and configures one app instance. A single Node
process therefore serves exactly one registration: one client id, one secret, one set of webhook signatures.
"A second registration" (a dev registration next to production, or a second store organisation with its own
custom app) is either a second deployment with its own environment or a per-request registration map that
resolves the credentials from the incoming shop before the framework sees the request.

Rule: decide early, and encode it in the deploy targets (`deploy.targets` in the manifest: one target per
registration when it is a second deployment). Retrofitting a registration map into a framework that assumed one
app at import time touches every auth path.

## What is safe to change later

Scopes (through the scopes-update flow), webhook subscriptions (through the toml), app URLs (through the toml
with `automatically_update_urls_on_dev` off in production), extensions (through `app deploy`). Everything that
is not the distribution type or the client id.

Sources: app-1 (architecture doc); app-3 (ADR series, multi-tenant rebuild plan).

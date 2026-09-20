# API version drift

An app pins one Admin API version in its GraphQL client and believes that is the version it runs on. It is not.
Webhook payloads, extension targets and the client each carry their own version, and they drift independently.

## Webhook payloads are not governed by the client pin

The version pinned in the GraphQL client (`ApiVersion.<MonthYY>` in the client library, or the version segment
of the endpoint URL) governs the shape of query and mutation responses. Each webhook topic carries its own
version, set per subscription in the app toml (`[webhooks] api_version`) or in the Partner dashboard, and the
delivery announces it in the `x-shopify-api-version` header. A client bump does not move the webhook version, and
a toml change does not move the client.

Rule: log `topic` and the `x-shopify-api-version` header on every accepted delivery, before any
test-notification short-circuit, so that "which version did we actually receive after the bump" is a log query
and not a console walk. A receiver that returns early for test notifications before logging hides exactly the
deliveries a bump audit needs.

## A stale pin fails silently forward

When an app requests a version that is no longer supported, the platform serves the oldest supported version
instead of failing. The response looks normal; only the fields differ. What you ask for is not necessarily what
you get, so a pin that nobody bumped keeps "working" until a field it relied on is gone.

Rule: the version-bump cadence is a calendar item, and the pins are tripwired: a test asserts that every file in
`apiVersion.pins` states `apiVersion.expected` and that the client-library pin and every toml's
`[webhooks] api_version` agree with it. The `tripwire` skill has the shape.

## A version bump is its own PR

A bump touches every entry in `apiVersion.pins` together (the client pin, every app toml, every extension
toml), re-declares the webhook subscriptions (a toml change is a subscription change on deploy), and changes the
payloads the handlers parse. That is a change with its own review surface.

Rule: never bump the version as a side effect of a dependency upgrade or an unrelated feature. Open a PR whose
only change is the bump, run the webhook handlers' payload readers against the new version's shape, and update
`apiVersion.expected` in the manifest in the same PR so the review agents check the new pins.

## The pins that must agree

| Where | What | Governs |
| --- | --- | --- |
| Shopify server module | `apiVersion: ApiVersion.<MonthYY>` | GraphQL query and mutation responses |
| each `shopify.app.*.toml` | `[webhooks] api_version` | webhook payload shapes for that registration |
| each extension toml | `api_version` | extension target and Liquid/UI extension APIs |
| the manifest | `apiVersion.expected` | what the review agents and tripwires assert |

A tripwire reads all four and fails naming the file and the value to write.

Sources: app-1 (architecture doc, ops doc); app-2 (contributor guide); app-3 (ADR series, webhook intake).

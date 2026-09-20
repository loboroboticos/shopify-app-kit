---
name: admin-api
description: Change Admin API GraphQL calls, webhook handlers or app toml declarations in a Shopify app without breaking the API-version pins, webhook parity or error-handling contracts declared in this repo's .claude/shopify-app.json. Use when adding or editing a GraphQL query or mutation, a webhook topic or handler, a metaobject or metafield definition, or when a mutation returned userErrors or THROTTLED.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(jq *), Bash(cat *), Bash(grep *), Bash(node *), Bash(npm test*), Bash(pnpm test*)
---

# shopify-app-kit admin-api

The Admin API fails in ways that return HTTP 200: throttles, business-rule errors, silently substituted versions,
stale caches. Every step below exists because one of those was once mistaken for success. Detail and rationale live
in `references/`; the steps are the contract.

## Steps

1. **Read the manifest.** From `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json` take `apiVersion.expected`,
   `apiVersion.pins`, `webhooks.topics`, `webhooks.compliance`, `scopes.required`, `scopes.optional`,
   `paths.appTomls`, `paths.webhookHandlers` and `paths.shopifyServer`.

2. **Check the pin discipline before touching anything.** Every file in `apiVersion.pins` must state
   `apiVersion.expected`; the client-library pin and each toml's `[webhooks] api_version` must agree. If they do
   not, stop and say so: a version bump is its own PR, never a side effect of the change you were asked for
   (`references/api-version-drift.md`).

3. **Check topic and handler parity.** Every topic in `webhooks.topics` has one handler under
   `paths.webhookHandlers` and one subscription in the tomls or the Shopify server module, and nothing is handled
   or subscribed that the manifest does not list. With `compliance: true`, the three privacy topics have real
   handlers. Fix parity in the same change, and update the manifest when a topic is genuinely new
   (`references/webhooks.md`).

4. **Use the Shopify Dev MCP when it is configured.** Call `learn_shopify_api` first, then the schema introspection
   and documentation search tools to confirm that every field, mutation, input type and webhook topic you rely on
   exists in `apiVersion.expected`. Without the MCP, say that the shape is unverified and keep the change minimal.

5. **Write the call through the app's one GraphQL transport** (never inline in a route, never exported from a
   server-action module). On any non-empty `userErrors` in a mutation response, throw. Retry on `THROTTLED` and
   on 429/500/502/503/504; never on `MAX_COST_EXCEEDED` (`references/graphql-errors.md`).

6. **Webhook receivers** verify the HMAC over the raw body before parsing, go through the one shared preamble
   wrapper, read payload keys with `in` rather than truthiness, and throw only for the two fields that cannot
   degrade (`references/webhooks.md`).

7. **Metaobjects, metafields and storefront reads** go through the `$app:` reserved prefix and app-data
   metafields, and never poll the storefront for freshness (`references/metaobjects-and-app-accessors.md`).

8. **Before adding a registration, scope or distribution change**, read `references/distribution-is-one-way.md`:
   distribution is locked at registration creation and one process serves one registration.

9. **Run the repo's tripwires** (`checks.tripwireDir`) and the unit tests, then report: the version you verified
   against, the parity table (topic, handler, subscription) and any manifest edits.

## References

- `references/api-version-drift.md`: client pin vs per-topic webhook versions, logging the version header,
  silent fallback to the oldest supported version, a bump as its own PR.
- `references/webhooks.md`: raw-body HMAC, the single preamble wrapper, compliance topics, key-presence reads.
- `references/graphql-errors.md`: `THROTTLED` on 200, `userErrors` is a failed write, retry policy, transport
  module must not be an RPC endpoint.
- `references/metaobjects-and-app-accessors.md`: `$app:` prefix, CDN edge cache lag, entitlement as app-data
  metafields.
- `references/distribution-is-one-way.md`: custom vs public is locked at creation; one process, one registration.

# Webhook receivers

A webhook route is a public, unauthenticated HTTP endpoint that the platform retries and eventually disables.
Every rule here follows from one of those three facts.

## Verify the HMAC over the raw body, before parsing

The signature covers the exact bytes the platform sent. Any framework helper that parses JSON first can
re-serialise differently, and a verification over the re-serialised body passes or fails for the wrong reasons.

Rule: `request.text()` (or the equivalent raw-body read) first, verify the HMAC over that string with the app
secret, and only then parse. A failed verification is a 401 with no processing, no logging of the body, and no
side effects. Frameworks that ship a webhook authenticator already do this; the rule is for hand-rolled routes.

## One wrapper owns the preamble

HMAC verification, topic extraction, the version log line (see `api-version-drift.md`), and the
test-notification branch are the same for every topic. When each receiver re-implements them, one of them
eventually stops calling verification and becomes a public write endpoint.

Rule: one wrapper (`withWebhook(topic, handler)` or the framework's authenticator) owns the preamble, and every
receiver goes through it. A build-time check (a tripwire or the `review-correctness` agent's auth-boundary
check) asserts that every exported webhook handler calls it, so a receiver that stops calling it fails the build
rather than shipping.

## The topics every app needs

- `app/uninstalled`: delete or mark the shop's sessions and stop processing for that shop. Always.
- `app/scopes_update`: store the granted scopes so the app requests only what is missing. Always.
- The three compliance topics when `webhooks.compliance` is true: `customers/data_request`,
  `customers/redact`, `shop/redact`. Each needs a real handler that enqueues a real redaction or export job. A
  200 stub passes the platform's check on subscription and fails the app's obligations; review it as P0.

## Read REST-shaped payloads by key presence, not truthiness

Webhook payloads are REST-shaped JSON where legitimately null fields are common (`closed_at`, `cancelled_at`,
`cancel_reason`). A reader that tests `if (payload.closed_at)` cannot tell "the order is open" from "the field was
renamed in the version we now receive".

Rule: assert presence with `in` (`'closed_at' in payload`). For fields the handler can degrade without (a
timestamp used for display, an optional note), warn and continue. Throw only for the two fields nothing can
degrade around: the resource's GraphQL id (`admin_graphql_api_id`) and `created_at`. A throw makes the platform
retry, and enough failed retries disable the subscription for that topic; a warning does not.

## Insulate the handler from the payload

A handler that reads the id from the payload and re-fetches the resource over GraphQL at the client's pinned
version is insulated from webhook payload drift by construction: the payload only has to keep its id. Prefer
this shape for anything with more than a few fields. The cost is one query per delivery; the benefit is that a
webhook version bump cannot change what the handler sees.

## Behaviour under redelivery

Handlers are idempotent (the platform redelivers on any non-2xx and sometimes without one), tolerate a shop
record that no longer exists, answer within the platform's timeout, and push slow work onto a job. The
`review-correctness` agent checks all four.

Sources: app-1 (architecture doc); app-2 (contributor guide); app-3 (ADR series, webhook intake).

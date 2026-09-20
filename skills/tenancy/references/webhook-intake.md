# The webhook intake seam

Every webhook passes through one seam in a fixed order. The order is the security model: nothing is recorded,
resolved or processed until the signature has been verified.

## Verify, record, process, mark

The seam has four stages. Verify: check the HMAC over the raw body. Record: insert an intake row (delivery id,
topic, shop, received time, status `received`) so the delivery is durable before any work. Process: hand the
verified, parsed payload to the topic handler inside `withTenant`. Mark: set the intake row to `processed` or
`failed` with the error. A crash between record and mark leaves a `received` row a sweeper retries; a crash
before record leaves nothing, and the platform's own retry covers it.

Rule: one wrapper implements the four stages (the `admin-api` skill's `webhooks.md` names the parity check);
handlers are pure functions of the verified payload and never see the request.

## HMAC first: 401 before anything is recorded

Verification happens before the intake row, before the tenant lookup, before parsing. An unsigned or badly
signed request gets a 401 and leaves no trace beyond a log line. Shopify's app review sends deliberately
unsigned probes and expects the 401; an app that records or processes them fails review, and an app that
resolves the tenant first has turned an unauthenticated request into a database read keyed on attacker input.

Rule: the seam returns 401 from the verify stage; a probe in the tripwire suite posts an unsigned body and
asserts 401 and an unchanged intake table.

## Idempotent intake keyed on the delivery id

The intake row's primary key is the delivery id the platform sends (`X-Shopify-Webhook-Id`). A redelivery of
the same id is a no-op at the record stage (insert on conflict do nothing, then return the existing status),
so a handler that is not itself idempotent is still run once per delivery. Handlers that can be re-run safely
say so and the seam re-processes a `failed` row on request; the others stay `failed` for a human.

Rule: the delivery id is the key, not the topic plus resource id; two distinct deliveries about the same
resource are two rows.

## Compliance payloads are never persisted

The three compliance topics (`customers/data_request`, `customers/redact`, `shop/redact`) carry personal data
in the payload. The record stage stores the envelope only (delivery id, topic, shop, time), never the body;
the handler processes the in-memory verified payload and, for `customers/redact` and `shop/redact`, deletes
the shop's or customer's rows through the redaction function that is the audit table's only deleter.

Rule: the intake table has no body column for compliance topics (a check greps the record stage); a stored
compliance payload is itself a compliance failure.

## The signature covers the body only

The HMAC signs the request body. The shop domain and the topic ride in headers the signature does not cover,
so a valid body can arrive with a swapped shop header. Non-destructive topics may use the header to pick the
tenant because the payload's own shop fields will disagree and the handler will find nothing to change;
destructive topics (`app/uninstalled`, `shop/redact`, `customers/redact`) must re-derive the tenant from the
verified payload's shop identifiers and refuse when they disagree with the header.

Rule: the seam passes both the header shop and the payload shop to the handler; destructive handlers assert
they match before entering `withTenant`.

Sources: app-3 (ADR series: webhook intake seam, GDPR redaction); app-2 (contributor guide: HMAC before parsing, unsigned review probes).

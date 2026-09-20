# OAuth for MCP clients: dynamic registration and PKCE

Some MCP clients cannot hold a static token and expect to discover the server, register themselves and obtain
a token through a browser consent. The flow is standard OAuth with the parts that matter pinned down.

## Dynamic client registration is persisted

Clients register through the RFC 7591 endpoint (`/register`), which validates the request (redirect URIs
under `redirect-uri.md`, a client name, the grant types the server supports) and persists a row in a client
table with the generated `client_id`, the redirect URIs and the registration time. Registration is
unauthenticated by design and therefore rate-limited per IP and pruned: a client row never used to complete a
consent within a day is deleted.

Rule: a client is a database row, not an in-memory map; a restart must not orphan an in-flight consent.

## PKCE S256 and the tenant-prefixed code

Every authorization request carries `code_challenge` with `code_challenge_method=S256`; `plain` and a missing
challenge are rejected. The authorization code is a random value, stored hashed with its `client_id`,
`redirect_uri`, challenge, the consenting principal and a five-minute expiry; the token endpoint verifies the
`code_verifier` against the stored challenge and deletes the code on first use. In a multi-tenant app the code
carries the tenant prefix too (`<tenantId>.<code>`), so the token endpoint enters `withTenant` before looking
the code up, exactly as `per-grant-tokens.md` does for tokens.

Rule: a code is single-use; a second presentation revokes any token minted from the first (RFC 6749 §4.1.2).

## The consent page lives outside the dashboard layout

The consent page (`/oauth/consent`) is its own route group with its own minimal layout, not a page inside the
dashboard. A dashboard layout that redirects an unauthenticated visitor to sign-in strips the authorization
request's query string on the way there and back; the user signs in and lands on the dashboard with the consent
lost. The consent route handles sign-in itself (redirecting to sign-in with a `returnTo` that preserves the
full request), shows the client name, the requested role and the tools that role unlocks (from the manifest,
`manifest-parity.md`), and denies with a clear message when the signed-in principal's `roleLevel < 1`.

Rule: the consent route never trusts `client_id` or `redirect_uri` from the query without matching them to the
registered client row first.

## Discovery documents

`/.well-known/oauth-authorization-server` (RFC 8414) publishes the endpoints, the supported grant types
(`authorization_code` only), `code_challenge_methods_supported: ["S256"]` and
`token_endpoint_auth_methods_supported: ["none"]`; `/.well-known/oauth-protected-resource` (RFC 9728) points
the MCP resource at that authorization server. Both are static JSON derived from the app's public URL and
cached for an hour.

Rule: the discovery documents are generated from the same route table the endpoints are mounted on; a tripwire
compares them.

## Token endpoint posture

The token endpoint returns `Cache-Control: no-store` and `Pragma: no-cache`, is rate-limited per IP, and
refuses to run when the app's public URL is a host it does not recognise as its own (a mis-set environment
variable would otherwise mint tokens for a phishing copy). Tokens are the same per-grant tokens as
`per-grant-tokens.md`, with a 30-day expiry and no refresh grant: `refresh_token` is not in
`grant_types_supported`, and a client re-runs consent monthly. That is by design; a refresh token is a second
long-lived credential to protect for no gain at this scale.

Rule: the token response carries `expires_in` and the client is expected to re-consent; the server never
silently extends.

Sources: app-2 (contributor guide: OAuth endpoints, consent route group, discovery); app-3 (ADR series: MCP auth substrate, tenant-prefixed codes).

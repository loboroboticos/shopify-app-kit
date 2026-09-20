# Per-grant bearer tokens

A token is a grant: one row, one user, one role, one expiry, revocable on its own. The cleartext exists in the
user's clipboard and nowhere else.

## A format a scanner can match

Tokens are `<prefix>_<32-byte-base64url>`: a short app-specific prefix, an underscore, then 32 random bytes
in base64url. The fixed prefix lets secret scanners (the `.gitleaks.toml` custom rule, the platform's push
protection) match a leaked token by shape. The cleartext is shown once, at creation; the server persists only
`sha256(token)` and a non-sensitive preview `prefix_***last4` for the list view. A lookup hashes the presented
token and finds the row by hash; a database dump reveals no usable credential.

Rule: no reversible encryption, no "show token again" endpoint; a lost token is revoked and a new one minted.

## One row per grant

Each token is a row with `userId`, `roleLevel`, `hash`, `preview`, `createdAt`, `expiresAt` (30 days from
creation), `revokedAt`, `lastUsedAt` and `lastUsedIp`. The user lists their grants (preview, created, last
used, expiry) and revokes any one; revocation sets `revokedAt` and the next request with that token is a 401.
Expiry is not extended by use; a monthly re-mint is by design and is the moment a forgotten grant dies.

Rule: a grant's role never exceeds its creator's role at creation time, and lowering the creator's role later
revokes the grants above the new level.

## Bearer only, matched case-insensitively

The token arrives in `Authorization: Bearer <token>` and nowhere else (no query parameter, no cookie, no custom
header). The scheme is matched case-insensitively, as RFC 6750 requires, so `bearer` and `BEARER` both work.
A missing header, a different scheme, an unknown hash, an expired or revoked row are all the same 401 with a
`WWW-Authenticate: Bearer` challenge and no hint of which check failed.

Rule: the token extractor is one function used by every MCP route; a tripwire asserts no route reads
`Authorization` on its own.

## Last used and the IP allowlist

`lastUsedAt` and `lastUsedIp` are bumped best-effort after a successful authentication (a fire-and-forget
update that never blocks or fails the request). The client IP is `x-real-ip` when the reverse proxy sets it,
otherwise the rightmost entry of `x-forwarded-for`: the leftmost entry is whatever the client claimed, the
rightmost is what the proxy in front of the app observed. An optional per-grant IP allowlist compares that
address and rejects with 401 when it does not match.

Rule: never read the leftmost `x-forwarded-for` entry for anything security-relevant.

## The resolved context and assertRole

After authentication the request carries `{ userId, roleLevel, tokenId }` in an `AsyncLocalStorage` store for
the rest of its life. Every tool handler starts with `assertRole(n)`, which reads the store and throws a
403-shaped error when `roleLevel < n`; a tool without the assertion is a tool anyone with any grant can call.
The manifest parity check (`manifest-parity.md`) reads the asserted level and compares it with the manifest's
role column.

Rule: no tool reads the user from its arguments; the store is the only source of identity inside a tool.

## Tenant-prefixed tokens under RLS

In a multi-tenant app the token is `<prefix>_<tenantId>.<secret>`. The tenant id is a routing prefix: the
extractor parses it, enters `withTenant(tenantId)`, and looks up the grant by `sha256(secret)` inside that
transaction, under ordinary row-level security. A forged prefix routes the lookup into a tenant whose grant
table holds no row with that hash, so the request fails closed with the same 401; no bypass role, no
cross-tenant grant table, no special case.

Rule: the grant table is a domain table like any other (registered in the probe suite); the token lookup is a
probe in the registry's read path.

Sources: app-2 (contributor guide: token format, hashing, Bearer matching, IP allowlist); app-3 (ADR series: MCP auth substrate under RLS).

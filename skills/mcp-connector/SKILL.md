---
name: mcp-connector
description: Build or change a Shopify app's own operator-facing MCP server (a product feature of the app, never part of this kit): per-grant bearer tokens hashed at rest, OAuth with dynamic client registration and PKCE, a strict redirect-URI policy, a tool manifest with a build-time parity check, per-token rate limits with a budget on anything billed, and operator skills shipped from the app. Use when adding or changing an MCP tool, token, consent page, OAuth endpoint, redirect-URI rule, rate limit, or a downloadable operator skill, or when a review asks how an agent authenticates to the app.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(jq *), Bash(cat *), Bash(grep *), Bash(node *), Bash(npm test*), Bash(pnpm test*)
---

# shopify-app-kit mcp-connector

An MCP server turns the app into something an agent can drive at machine speed with a credential the operator
minted once. Every step below bounds what that credential can do, where it can be sent, and what it can spend.
Detail and rationale live in `references/`; the steps are the contract.

## Steps

1. **Read the manifest.** From `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json` take `database.rls`,
   `paths.server` and `checks.tripwireDir`. With `database.rls` true, every token carries the tenant id as a
   routing prefix and the grant is read within ordinary RLS under that tenant; with it false, the grant lookup
   is the tenant scoping and must be explicit.

2. **Tokens** are `<prefix>_<32-byte-base64url>` (or `<prefix>_<tenantId>.<secret>` in a multi-tenant app),
   shown once, stored as `sha256(token)` with a `prefix_***last4` preview, one row per grant with `expiresAt`
   (30 days) and `revokedAt`, listed and revocable by the user. Bearer only, matched case-insensitively; no
   token or an invalid token is a 401 (`references/per-grant-tokens.md`).

3. **Every tool** reads `{ userId, roleLevel, tokenId }` from `AsyncLocalStorage` and calls `assertRole(n)`
   first. A tool that spends money (image generation, a paid lookup) has its own budget or does not exist;
   writes are cheap and reversible (`references/rate-limits-and-cost.md`).

4. **OAuth** for clients that cannot hold a static token: dynamic client registration persisted to a client
   table, PKCE S256, a consent page in its own route group outside the dashboard layout, discovery documents,
   a `no-store` rate-limited token endpoint, 30-day tokens with no refresh grant
   (`references/oauth-dcr-pkce.md`).

5. **Redirect URIs** are parsed as URLs: loopback (including `[::1]`) is allowed over http or https and bypasses
   the host allowlist; any other host is https and, when `MCP_ALLOWED_REDIRECT_HOSTS` is set, in it. Validate
   at registration, authorize, consent and token; never reflect to an unmatched `redirect_uri`
   (`references/redirect-uri.md`).

6. **The tool manifest** (category, role, read vs write) is the single source of truth for the consent UI; add
   the row and the tool in the same change. The build-time parity check asserts exact parity and the
   no-hard-delete rule; the tool count comes from the check (`references/manifest-parity.md`).

7. **Operator skills** ship from the app as a ZIP per skill with frontmatter limited to the six portable
   fields; the parity script enforces it (`references/skills-distribution.md`).

8. **Run the parity check and the tripwires** (`checks.tripwireDir`), then report: the tools added with their
   manifest rows, the role each asserts, the token or OAuth path touched, and the redirect-URI cases covered.

## References

- `references/per-grant-tokens.md`: token format, hashing, per-grant rows, Bearer matching, last-used and IP
  allowlist, the resolved context, tenant-prefixed tokens under RLS.
- `references/oauth-dcr-pkce.md`: dynamic client registration, PKCE, the consent route group, discovery, the
  token endpoint posture.
- `references/redirect-uri.md`: parse as URL, loopback bypasses the allowlist, https and allowlisted otherwise,
  validate at every step.
- `references/manifest-parity.md`: the manifest as the consent source of truth, the parity check, no hard delete.
- `references/rate-limits-and-cost.md`: per-token limits sized for reads, budgets on billed calls, cheap
  reversible writes.
- `references/skills-distribution.md`: skills ship from the app, the six portable frontmatter fields.

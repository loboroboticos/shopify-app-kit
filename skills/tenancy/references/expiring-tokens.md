# Expiring offline access tokens

Offline access tokens used to live forever; for public apps they now expire (which apps, from when, and the
lifetimes are the companion's `shopify-dev` facts). Obtaining a new token immediately invalidates the previous
refresh token, so there is one live refreshable token per app per store and refresh is a concurrency problem.
The manifest records the posture as `auth.expiringOfflineTokens`; the `doctor` prints it.

## Migrating existing installs

A session row with no refresh token is pre-flag: that shop still holds a non-expiring offline token. Migrate
them with a guarded one-shot script: for each active shop without a refresh token, a token exchange with
`expiring=1` against the stored token, the result persisted through the refresh chokepoint below. Its dry run
lists the shops it would touch and writes nothing; the production run is a `human:decision` issue, since a
failed exchange strands a shop until it re-authorizes. Done when no active shop lacks a refresh token.

## The library flag and the session columns

The app library opts in through `future.expiringOfflineAccessTokens` in the Shopify server module
(`paths.shopifyServer`); the session model gains `refreshToken` and `refreshTokenExpires` next to
`accessToken` and `expires`, and the session storage adapter persists both. The `prisma-migration-reviewer`
agent checks the columns when the flag is on.

Rule: the flag and the columns land in the same PR; a flag without columns loses the refresh token on the first
persist, and columns without the flag are dead weight the reviewer questions.

## One refresh chokepoint

A background worker (a cron sync, a webhook replay) that refreshes a shop's token independently of a web
request races the request path: both present the same refresh token, one wins, and the other side's refresh
token is now invalid, stranding that path until the shop re-authorizes. All refreshes therefore go through a
single function that takes a per-shop lock (an advisory lock or a row lock on the session), re-reads the
session inside the lock, returns the current access token if it is still valid, and otherwise refreshes,
persists and returns. Every caller (the request path, every worker, every webhook handler) uses it; nothing
else touches the refresh endpoint.

Rule: one exported `getAccessToken(shop)` that locks; a tripwire asserts the refresh endpoint is called from
that one file only.

## Dead-session purge keys on refresh-token expiry

A session whose access token expired is alive: the refresh token can mint a new one until it expires. A purge
that deletes sessions on `expires` throws away shops that merely went quiet for an hour. The purge keys on
`refreshTokenExpires`; only a session whose refresh token has expired (or whose shop uninstalled) is dead.

Rule: `expires` drives refresh; `refreshTokenExpires` drives deletion; the two never swap roles.

Sources: app-3 (rebuild plan: token refresh under workers); app-2 (contributor guide: session storage columns).

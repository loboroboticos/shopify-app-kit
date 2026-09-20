# Expiring offline access tokens

Offline access tokens used to live forever. For public apps they now expire, and a refresh is a one-shot
operation that invalidates its predecessor, which turns token refresh into a concurrency problem.

## The requirement and its dates

Shopify requires expiring offline access tokens for public apps created on or after 2026-04-01 and for all
public apps from 2027-01-01. An access token lives 60 minutes; the refresh token lives 90 days. Obtaining a new
token immediately invalidates the previous refresh token, so there is exactly one live refreshable token per app
per store at any moment. The manifest records the posture as `auth.expiringOfflineTokens`; the `doctor` prints it.

Rule: a public app created in 2026 sets `auth.expiringOfflineTokens: true` from the first commit; retrofitting
means a session-table migration and a token-refresh path under load.

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

A session whose access token expired is alive: the refresh token can mint a new one for up to 90 days. A purge
that deletes sessions on `expires` throws away shops that merely went quiet for an hour. The purge keys on
`refreshTokenExpires`; only a session whose refresh token has expired (or whose shop uninstalled) is dead.

Rule: `expires` drives refresh; `refreshTokenExpires` drives deletion; the two never swap roles.

Sources: app-3 (rebuild plan: token refresh under workers); app-2 (contributor guide: session storage columns).

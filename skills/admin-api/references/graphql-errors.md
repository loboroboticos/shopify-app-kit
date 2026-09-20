# GraphQL errors that arrive as HTTP 200

The Admin GraphQL API reports most failures inside a 200 response. Code that checks the status code and moves
on treats throttles, cost overruns and rejected writes as success.

## Throttles

A throttle arrives as an entry in the top-level `errors` array with `extensions.code` equal to `THROTTLED`, on a
200. The code is uppercase; matching `throttled` in lowercase, or matching the message text, misses it.

Rule: match `extensions.code === 'THROTTLED'` exactly. Read `extensions.cost.throttleStatus` (`currentlyAvailable`,
`restoreRate`) to compute the wait rather than sleeping a fixed interval.

## Retry policy

| Signal | Retry? | Why |
| --- | --- | --- |
| `THROTTLED` (200) | yes, after the cost restores | the request was never executed |
| HTTP 429, 500, 502, 503, 504 | yes, with backoff and a cap | transient on the platform side |
| `MAX_COST_EXCEEDED` (200) | never | the query is too expensive at any point in time; split it |
| any other `errors` entry | no | a malformed query does not improve on retry |
| non-empty `userErrors` | no | the write was rejected on business rules |

## `userErrors` is a failed write

Every mutation returns a per-mutation `userErrors` field on 200. A non-empty list means the platform rejected
the write (validation, state, permissions); the rest of the payload is usually null. Code that reads the mutated
object without checking `userErrors` reports success and continues with nothing.

Rule: a shared helper checks `userErrors` on every mutation and throws with the field paths and messages. Never
proceed on a 200 that carries them. The `review-correctness` agent flags an unchecked `userErrors` as P1.

## The transport is not an endpoint

The module that owns the raw GraphQL call (client, retry, error normalisation) is imported by services. If that
module is also a server-action or RPC module (`'use server'`, a framework's exported action convention), its
exported transport becomes callable by any signed-in session with an arbitrary query, which is unrestricted
Admin API access through the app's own token.

Rule: keep the transport in a plain server module that is never exported from an action or RPC boundary.
Routes and actions call named service functions with typed inputs; the query text lives only in the service.
A tripwire can assert the transport module carries no server-action directive and is not re-exported from one.

## One GraphQL home

The same query pasted in two routes drifts (one gets the `userErrors` check, the other does not). Queries and
mutations live in one module per resource; routes import functions, not strings. The `review-quality` agent
treats a second copy as a should-fix.

Sources: app-1 (architecture doc); app-2 (contributor guide).

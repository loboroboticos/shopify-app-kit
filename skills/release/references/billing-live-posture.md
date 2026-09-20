# Billing posture when the app charges real money

The Billing API has one flag between a test charge and a real one. These rules keep the flag, the plan names,
the caches and the ledgers from disagreeing.

## The test flag is an environment fact

Every subscription mutation carries `test: true|false`. Production sets it off; every other environment (local
dev, hosted dev, beta, CI) sets it on. The value comes from one environment variable named in the manifest as
`billing.testFlag`, read in one billing module, and nowhere else.

Rule: no hard-coded `test:` literal anywhere; no environment where the flag is unset (unset must fail closed to
test mode). A tripwire asserts the billing module is the only file that reads the variable. The
`review-correctness` agent treats a hard-coded flag as P0 when `billing.live` is true.

## Tier and plan names are data

A live subscription is reverse-mapped to its tier by the plan name the platform stores. Renaming a tier in code
without migrating the stored names orphans every existing subscriber into "no plan".

Rule: plan names, prices, trial days and intervals are data, versioned with the app. A rename is a data
migration with a backfill, reviewed as one. Never change them silently inside a feature PR.

## Cache invalidation is a contract

Entitlement is cached per shop (in memory, in a metafield, in a row). Every writer of plan state (subscription
webhook, comp grant, reconcile job, admin override) must invalidate that cache. One writer that forgets leaves a
shop on the wrong tier until the next unrelated write.

Rule: one function writes entitlement and invalidates; every path calls it. This is load-bearing enough to
tripwire: a test lists the writers and asserts each calls the invalidator (regex over source is fine).

## The reconcile job is the backstop

A missed `app_subscriptions/update` (tunnel down, deploy in flight, topic disabled after too many failures)
leaves the app believing an expired or cancelled plan is active. A scheduled reconcile job queries the
platform for each shop's active subscription and repairs the local state.

Rule: the reconcile job has a frozen grace window (a fixed number of days after which a shop with no active
subscription is downgraded), stated in one place and never tuned per incident. The job is scheduled; the
`ci-posture.md` liveness check covers it.

## Comp access is a ledger

Complimentary access (a partner, a demo store, a merchant during an incident) is a first-class table with who
granted it, why and until when, read by the same entitlement function as paid plans. A hard-coded shop list or a
"skip billing for this shop" flag is an incident waiting for the next rename.

## Keep test and live ledgers apart

Test subscriptions created under the dev registration and live subscriptions under production must never share
a table without a column that separates them, and reports must filter on it. A staging database restored from
production carries live ledger rows; mark them before anything reads them.

Sources: app-1 (pricing doc, architecture doc).

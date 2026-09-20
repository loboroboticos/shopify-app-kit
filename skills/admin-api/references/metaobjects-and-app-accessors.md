# Metaobjects, app-data metafields and the storefront cache

How an app publishes data the storefront can read without a server round-trip, and the two ways that goes wrong.

## App-owned metaobject definitions live in the toml

Metaobject definitions the app owns are declared in the app toml and created on deploy for the registration
that deploys them. The resulting type is namespaced to the app as `app--<app id>--<type>`, so the numeric app id
of the registration is part of the type name.

## Storefront Liquid reads them through `$app:`

A theme app extension block reads the app's own metaobjects with the reserved prefix:

```liquid
{% assign entries = shop.metaobjects['$app:<type>'].values %}
```

`$app:` resolves at deploy to the serving registration's `app--<id>--<type>`. The block never hard-codes the
numeric id, so the same extension source serves the dev registration and the production registration without
a build step. A block that spells out `app--123456--<type>` works on exactly one registration and breaks
silently on the other.

Rule: `$app:` for app-owned metaobjects and app-owned metafields (`$app:<key>` in metafield namespaces). Never a
literal app id in Liquid, JavaScript or a fixture.

## Storefront reads are edge-cached

Metafield and metaobject reads on the storefront sit behind the CDN edge cache. A write through the Admin API
can take hours to show in a rendered page, and different edges can disagree.

Rule: never poll the storefront expecting freshness, never write a "retry until the value appears" loop, and
never "fix" a stale read in code (a cache-busting query parameter, a duplicate read path). Verify a write through
the Admin API; verify a rendered page only as a probe (see the `tripwire` skill's `checks-vs-probes.md`) with
the lag written into its expectations.

## Entitlement as app-data metafields

Writing a shop's entitlement (plan, feature flags, limits) as app-data metafields on the `AppInstallation`
lets a storefront extension render the right state from Liquid alone: no app proxy, no server call, no
per-request latency, and the extension keeps working while the app server is down or scaled to zero. The app
writes on every entitlement change (subscription webhook, comp grant, reconcile job) and the storefront reads.

Rule: the entitlement writer is one function, called by every path that changes plan state, and it also
invalidates any server-side per-shop cache (see the `release` skill's `billing-live-posture.md`). The edge-cache
lag above applies: a plan change is visible in the admin immediately and on the storefront eventually.

Sources: app-1 (architecture doc, pricing doc).

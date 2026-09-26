---
paths:
  - "**/billing*"
  - "**/*subscription*"
  - "shopify.app.*.toml"
---

<!-- .claude/rules/billing.md (shopify-app-kit template). Seeds from the kit's `release/references/billing-live-posture.md` and `admin-api/references/distribution-is-one-way.md`;
     reads billing.method, billing.live and billing.testFlag from .claude/shopify-app.json. -->

# Billing

- The billing method is `billing.method` in the manifest and nowhere else. Under `app-pricing` there are no
  subscription webhooks: status comes from the Partner Active Subscription API on a schedule and on install.
  Under `billing-api` every subscription mutation carries the test flag.
- The test flag is the environment variable named by `billing.testFlag`, read in one billing module. Unset
  fails closed to test mode. A hard-coded `test:` literal is a review blocker when `billing.live` is true.
- Plan and tier names, prices, trial days and intervals are data; a rename is a data migration with a backfill.
- One function writes entitlement and invalidates the per-shop cache; every path calls it (tripwired).
- A subscribe, upgrade or plan change against the production registration is a real charge; it is
  `human:account` work, never a session's.
- Distribution is one-way: custom distribution forces the Billing API; App Pricing needs a public app.

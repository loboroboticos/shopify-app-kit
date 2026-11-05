<!-- docs/adr/SEEDS.md (shopify-app-kit template)
     The decisions a new Shopify app takes before Phase 1, one record each, even when the answer is the family
     default. Titles and questions only; the answers are the records. Drawn from the kit's admin-api, tenancy
     and mcp-connector references. Delete an entry here once its record exists. -->

# Seed decisions

Write one `NNNN-*.md` per entry before building anything that depends on it.

1. **Backend and isolation model.** One database for all tenants with row-level security, one schema per
   tenant, or one database per tenant? Which role does the app connect as, and who owns the schema?
2. **Code disposition.** A fresh app from the official template, or a fork of an existing app? What is kept,
   what is rewritten, and what is the cut-off for carrying old code forward?
3. **Forbidden patterns.** Which are ruled out from day one, each with the failure it caused and its check:
   unfiltered reads; system-credential writes serving client input; client-trusted tenancy; client-only
   authorization; ledger state mutated in place; a raw database client outside sanctioned files; theme-file
   writes and script tags?
4. **Schema ownership.** Do the migrations own the database roles, grants, RLS policies and views, or does
   something outside version control? What may never be created by hand?
5. **Isolation canary and probe contract.** Which permanent synthetic table proves RLS holds, which model
   registry drives the probes, which role do the probes run as, and what fails CI when a model is unregistered?
6. **Tenant provisioning and request bootstrap.** Where does the tenant identity come from on each request
   (session token, verified webhook, tenant-prefixed token), when is the tenant row created, and what happens
   when provisioning throws?
7. **Webhook intake seam and GDPR redaction.** Verify, record, process, mark: which table records deliveries,
   what is idempotent on, and how do the three compliance topics run without persisting their payloads?
8. **Principal and actor identity, append-only audit.** What is a principal (user, agent, parent of an agent),
   how does every write learn its actor, and who may delete from the audit table?
9. **MCP auth substrate.** If the app ships an operator-facing MCP server: per-grant tokens or OAuth with
   dynamic client registration, or both? Where is the tenant carried in the token?
10. **Deployment target.** Which platform, which release command runs migrations, does the app scale to zero
    before migrating, and where do the secrets live?
11. **Billing method.** `app-pricing` (public only, no subscription webhooks) or `billing-api` (legacy, public
    only; custom distribution cannot bill through Shopify)? The test posture, and which features each tier gates?
12. **Distribution.** Public App Store or custom distribution, and the listing tags and the category they imply?
    Locked at registration creation; going public later is a new registration every merchant re-installs under.
13. **Branch model.** One protected branch sessions PR into, or a default branch with a promotion PR to a
    protected release branch? Who lands the promotion?

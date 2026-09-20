---
name: Work item
about: A piece of work with a stated close condition, so the right executor picks it up
title: ''
labels: ''
assignees: ''
---

<!-- .github/ISSUE_TEMPLATE/work-item.md (shopify-app-kit template)
     Every issue says what can close it. The ladder below is the executor rung: a session reads the ticked line,
     applies the label, and never closes an issue whose rung is human:*. Rules: .claude/rules/pr-and-issues.md. -->

## What

<!-- One paragraph: the change, the merchant or operator it serves, how we will know it is done. -->

## Close condition needs

Tick exactly one group. Ticked lines from more than one group? Split the issue.

**Code and CI (an agent can close it)**
- [ ] A PR (code, config, docs, tests) → code only
- [ ] A GitHub Actions run using an existing secret → `agent:ci`
- [ ] A session that must reach the store itself, no login → `agent:cloud`
- [ ] A logged-in CLI / .env / browser on the maintainer's machine → `agent:local`
- [ ] A one-time human bootstrap that does not exist yet → link Bootstrap: #__

**Human (an agent never closes it)**
- [ ] A product / architecture / art-direction decision → `human:decision`
- [ ] Account, payment, payout, tax, 2FA, dashboard-only click, real money → `human:account`
- [ ] Legal, compliance, trademark, DPA, third-party review → `human:legal`

## Irreversibility check

- [ ] Closing this cannot create a real charge, write production data outside a guarded script, make a one-way
      Shopify choice (distribution type, app handle, pricing model), or change brand or legal text.

<!-- If you could not tick the box above, the issue is human:account, human:decision or human:legal. -->

## Notes

<!-- Links, prior art, the ADR it depends on. -->

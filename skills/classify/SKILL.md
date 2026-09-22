---
name: classify
description: Add cheap, high-speed classification (Jev / TypeSafe) to a Shopify app as a first-class capability: one guarded transport, a `classify` manifest section that registers every label set and a per-tenant budget, and a calibrated confidence the caller thresholds on to auto-act or escalate. Use when adding or changing a classification call, a label set, a classify budget or threshold, an operator MCP classify tool, or when a review asks how the app classifies text.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(jq *), Bash(cat *), Bash(grep *), Bash(node *), Bash(npm test*), Bash(pnpm test*)
---

# shopify-app-kit classify

A classifier turns bounded, high-volume text decisions — route this ticket, code this return, tag this review —
into one typed label plus a calibrated confidence, for a fraction of an LLM call. The kit ships the contract, not
the code: the transport, the budget and the thresholds live in the consumer app, governed by the manifest and a
tripwire. Depth is in `references/`; the steps are the contract.

## Steps

1. **Read the manifest.** From `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json` take `classify` (`provider`,
   `defaultEscalateThreshold`, `budget`, `labelSets`), `database.rls` and `checks.tripwireDir`. No `classify`
   section means the app classifies nothing yet; add the section in the same change as the first call.

2. **One transport.** Call `provider: jev` through one module that reads `TYPESAFE_API_KEY` in a single place and
   passes state as text; it returns `{ choice, confidence, probabilities }` and never a free-text string.
   Deterministic signals (blocklists, exact SKU match) stay rules, never a classify call
   (`references/jev-transport.md`).

3. **Name a declared label set.** Every call names a `labelSets` id from the manifest; the transport rejects an
   id that is not declared. The manifest is the single source of truth a tripwire asserts the code's `Choice`
   options against (`references/label-registry.md`).

4. **Budget it.** A classify call is billed: decrement a per-tenant cap in the same transaction the call is
   recorded, refuse when exhausted, and under `database.rls: true` run inside `withTenant`
   (`references/budget.md`).

5. **Threshold, then act.** Auto-act only when `confidence >=` the label set's threshold (or
   `defaultEscalateThreshold`); below it, escalate to a human, a queue or an LLM. Escalation is cheap and
   reversible — a tag, a status, a row — never an irreversible or customer-facing action
   (`references/thresholds-and-escalation.md`).

6. **Prove it on the MCP surface first.** The cheapest first call is an operator MCP classify tool: `assertRole`
   first, marked `billed` with its budget, returning `choice` + `confidence` for the agent to act on or escalate
   (`references/operator-mcp-tool.md`).

7. **Tripwire and review.** Add the label-parity tripwire (`skills/tripwire`) and run it; the
   `classifier-reviewer` agent checks every call against this section. Report the label sets touched, the budget
   and the thresholds.

## References

- `references/jev-transport.md`: the one transport, the three typed primitives, text-only, rules stay rules.
- `references/label-registry.md`: the manifest as the label source of truth and the parity tripwire.
- `references/budget.md`: the per-tenant budget decremented with the call, refusing when exhausted.
- `references/thresholds-and-escalation.md`: calibrated confidence, never auto-act below the floor, cheap reversible escalation.
- `references/operator-mcp-tool.md`: the billed, budgeted, role-scoped operator MCP classify tool.

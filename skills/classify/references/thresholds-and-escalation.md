# Confidence thresholds and escalation

The calibrated confidence is the whole reason to prefer a classifier over an LLM's prose verdict: it is a number
you can gate on. A classifier that always answers is a liability; one that abstains under a threshold and hands
the hard cases on is an asset.

## Never auto-act below the threshold

Every classify call reads a threshold — the label set's `escalateThreshold`, else `defaultEscalateThreshold` —
and auto-acts only when `confidence >=` it. Below the floor the answer is treated as "unsure": the item goes to a
human queue, a fallback rule, or a more expensive model, never to the automatic path. This is what keeps a cheap
first pass safe: the confident majority is handled for almost nothing and only the thin uncertain slice costs
attention. Set the floor per job from a labelled sample, not a guessed constant, and treat a rising escalation
rate as a signal the label set or the inputs have drifted.

## Escalation is cheap and reversible

The action a confident classification takes, and the escalation an unsure one takes, are both cheap to do and
cheap to undo: set a status, add a tag, write a queue row, link two records. A classification never sends a
message to a customer, creates a charge, or calls an irreversible mutation on its own — those stay a human action
or a dashboard confirmation, the same line `mcp-connector/references/rate-limits-and-cost.md` draws for MCP write
tools. A misclassification should cost a re-tag, not an apology or a refund.

Sources: app-2, app-3.

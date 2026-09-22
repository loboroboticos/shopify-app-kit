# Budget and billing for classify calls

A classify call costs money, and an agent or a webhook storm never reads the invoice. The same rule the kit
applies to any billed third-party call on the MCP surface applies here: the capability exists only behind a
budget.

## One per-tenant budget, decremented with the call

`classify.budget.monthlyCap` is a per-tenant ceiling stored in the database and decremented in the same
transaction that records the call, refusing with a clear error when it is exhausted and surfacing on the
dashboard. Under `database.rls: true` the decrement runs inside `withTenant`, so one tenant can never spend
another's budget, and the recorded call carries the actor the write is stamped with. A call path that classifies
without decrementing a budget is the review blocker `mcp-connector/references/rate-limits-and-cost.md` names for
a billed MCP tool: a loop that retries a "failed" classification at machine speed is exactly how a small per-call
cost becomes a large bill before anyone looks. Size the cap from the job's real volume, not a round number, and
alert before it is spent rather than after the refusals start.

Sources: app-2, app-3.

# The filing rules

Ten rules, applied in one pass when an issue is filed, triaged or relabelled. Every rule exists because its
absence cost a week somewhere: an issue nobody could pick up, a bootstrap that leaked a value, a decision that
sat unanswered, a human step an agent performed. The label set is `labels.json`; the executor order is its
`ladder` array. The lint in the triage routine checks R1, R2 and R8 on every open issue.

## R1: the ladder

Label the least-privileged executor that can close the issue once the bootstraps linked in its body are
closed. The order is `code only` → `agent:ci` → `agent:cloud` → `agent:local` → `human:decision` →
`human:account` → `human:legal`; `human:bootstrap` sits alongside `human:account` (a maintainer action with an
expiry and an Unlocks list). Labelling higher than needed parks agent work in a human's queue; labelling lower
makes a session start something it cannot finish. The rung is chosen from the close condition, not from who
happens to be free.

## R2: close condition needs

Every body carries the "Close condition needs" block from the work-item template with exactly one group
ticked. An issue with no ticked line cannot be labelled: the filer either writes the line or leaves the issue
unlabelled and listed by the lint, never guesses a rung. The line is the contract a session reads before
starting.

## R3: decompose at filing

Ticked lines from more than one executor mean the issue is split before it is labelled. The human-only line
becomes its own issue (with its own rung, priority and ROI); the agent-doable remainder keeps the original
number, gains `blocked` and says "after #N" in its body. Splitting later means a session half-finishes the
agent part and the human part is never filed.

## R4: bootstrap issues

A bootstrap is titled `Bootstrap: <what> → <where>` and names where the value goes (a secret name in Actions, a
hosting app's config, a dashboard field), never the value itself; its sensitivity class (public, secret,
payment); its expiry (a token's lifetime, a certificate's date, "none"); and `Unlocks: #a #b`, the issues that
become agent work when it closes. Its value is the maximum value of its Unlocks; its effort is the maintainer's
minutes. A bootstrap without Unlocks is a chore, not a bootstrap, and is filed as `human:account`.

## R5: decisions need options

A `human:decision` issue carries a comment with at least two options, a recommended default and a note on
irreversibility. When no options comment exists, the filer writes one; when the decision blocks agent work and
the default is reversible, the filer takes the default, states it in the PR description, and labels the work
`code only`. The decision issue stays open for the human to confirm or overturn.

## R6: irreversibility beats the ladder

Real money (a charge, a payout, a plan price), a production data write outside a guarded script, a one-way
platform choice (distribution type, app handle, registration, pricing model), uninstalling a legacy app, brand
or legal text, any 2FA or payout step: these are `human:decision` or `human:account` whatever a CLI could do.
A CLI that can do it is the reason for the rule, not an exception to it.

## R7: agents never close a human issue

An agent never closes a `human:*` issue and never relabels a `human:*` issue to `agent:*` or `code only`,
except in two cases: a comment beginning `decision:` on a `human:decision` issue (relabel per the decision,
remove `blocked` from its children, comment "unblocked by the decision on #N"), and a closed `Bootstrap:` issue
that lists the issue under Unlocks (remove `blocked`, comment "unblocked by #B"). Everything else waits for the
human, however obvious it looks.

## R8: same pass, same PR

A new issue gets its priority, its ROI bucket and, when the repo keeps a ranking doc, its row in that doc in
the same pass and the same PR as the filing. A queue where half the issues are unscored cannot be sorted, and
the triage routine's lint reports every issue missing one of the three labels.

## R9: CI-filed issues

A workflow or routine that opens issues searches the open issues for the same title prefix first and comments
on the match instead of filing again (one open issue per failure family). A new issue carries `bug` + `p1` +
the executor label that can close it, and never attaches traces, screenshots or test results: they carry
store data, tokens and URLs, and the run link is enough.

## R10: secrets never appear in an issue

No issue, comment or PR carries a secret, a token, a connection string or a store's private URL. A bootstrap
names where a value goes (R4) and the maintainer sets it there. An issue that already carries one is edited
first and the value rotated second.

## The queue exemption

One pinned issue per repo is the maintainer's queue: a tracking surface the triage routine rewrites on every
run (bootstraps by ROI then unlock count, decisions with their recommended default, then `human:account`,
then `human:legal`, the readiness table, the lint findings, the stale workflows). It carries no work-type,
priority or ROI label, its title is fixed, and the lint skips it. It is the one place a human reads instead of
the whole queue.

Sources: app-1 (ops doc and issue history: the ladder, bootstraps, the queue issue); app-2 (contributor guide: CI-filed issues, secrets in issues); app-3 (ADR series: decisions with options and a reversible default).

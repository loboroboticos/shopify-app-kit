# The label-set registry

A classifier is only as safe as the list of labels it can return. That list lives in the manifest, not scattered
across call sites, so the app promises a fixed vocabulary and a check can hold the code to it.

## The manifest owns the labels

`classify.labelSets` is a map from a job id (`supportIntent`, `returnReason`) to its candidate `labels` and an
optional `escalateThreshold`. Every classify call names one id; the transport refuses an id that is not declared,
so a typo or a drifted list fails loudly instead of classifying into a set the app never promised. Adding a job
is a manifest row plus the call in the same change, the way a webhook topic and its handler land together. A
`labels` array holds at least two and at most 255 entries (Jev's Choice cap); a job that needs more is really two
jobs, or a hierarchy resolved in stages.

## The parity tripwire

A `Choice` in code carries the same labels the manifest declares, and the two drift the moment someone edits one
and not the other. Ship a tripwire (`skills/tripwire`, the single-data-binding pattern) that reads
`classify.labelSets.*.labels` and the code's candidate constants and fails the build when they disagree, naming
the file and the exact labels to write. The same check asserts every call site is `billed` with a budget row and
that no site auto-acts below its threshold, the way the MCP manifest parity check asserts each tool's role and
its read/write flag. A warning in a CLAUDE.md that "the labels must match the manifest" is where drift hides;
make it this check.

Sources: app-2, app-3.

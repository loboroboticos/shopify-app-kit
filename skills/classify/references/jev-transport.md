# The Jev classification transport

Jev (TypeSafe's "System One" model, called through `@typesafe-ai/sdk`) is not an LLM: it takes typed state and a
typed question and returns a typed answer with a calibrated confidence in roughly 70–500 ms, at input-token
pricing far below a frontier model and no output-token cost. It never invents a string outside the set you give
it. That makes it the right tool for a bounded, high-volume decision and the wrong tool for anything that must
generate or reason in prose. Pin the SDK version and confirm the current call signatures against the provider's
docs, the way the kit pins and verifies the Admin API version.

## One transport module, one key

Reach Jev through a single module, the way the app reaches the Admin API through one GraphQL transport. The
module reads `TYPESAFE_API_KEY` from the environment in exactly one place (never in a client bundle, never
logged), defaults the model to the provider's pinned tag, and is the only file that imports the SDK. A call
passes program state as text or structured fields and gets back `{ choice, confidence, probabilities }`; the
transport is not a server action or an RPC endpoint any client can reach, and a caller never reads identity or
the label set from client input.

## Three typed primitives

Jev answers in one of three shapes, each with a confidence in 0..1 derived from the probability distribution: a
**Choice** (one label from a fixed candidate set of up to 255), a **Score** (a number on a rubric) and a boolean
(a calibrated yes/no). Classification is the Choice: the candidate set is declared once in the manifest
(`label-registry.md`) and the answer is exactly one of its members. Pass the labels as the criteria; read
`.choice` and `.confidence`, and `.probabilities` when a caller needs the runner-up or wants to log the margin.

## Text only, and rules stay rules

Jev takes text and structured state, not images: a pixel-level decision (nudity, garment type from a photo)
needs a vision model and is out of scope here. And a deterministic signal stays a deterministic rule — an
exact-match blocklist, a banned domain, an SKU lookup — because a rule is cheaper, exact and auditable where a
calibrated guess is not. The classifier earns its place only on the messy human text in between, and the review
lens flags a rule-shaped decision routed through the classifier.

Sources: app-2, app-3.

# Distributing operator skills from the app

The app's operator uses an agent to drive the MCP server, and the agent needs skills that describe the app's
tools and workflows. Those skills are part of the app, not of this kit, and ship from the app itself.

## Skills ship from the app

Each operator skill lives in the app repository under a skills directory and is served by the dashboard as a
ZIP per skill (a `SKILL.md` plus its references), downloadable by a signed-in operator with `roleLevel >= 1`.
The ZIP is built at release time from the repository, so the downloaded skill matches the deployed tool
manifest; the skill's text names tools by the manifest's names, and the parity check (`manifest-parity.md`)
greps each skill for tool names that no longer exist.

Rule: a tool rename updates the manifest, the server and every skill that names it, in one PR the parity check
enforces.

## Six portable frontmatter fields

The `SKILL.md` frontmatter is limited to the six portable Agent Skills fields: `name`, `description`,
`license`, `compatibility`, `metadata`, `allowed-tools`. The claude.ai skill upload validator hard-rejects any
other key (`disable-model-invocation`, `argument-hint`, `model`, `paths` and the other Claude Code-only fields),
so a skill that works in Claude Code fails to upload with an error the operator cannot fix. A parity script in
the app asserts every distributed skill's frontmatter keys are a subset of the six and that `name` equals the
directory name.

Rule: Claude Code-only behaviour goes in the body or in `metadata`, never in a top-level key; the script runs
in the verify gate.

Sources: app-2 (contributor guide: skill ZIPs, upload validator rejections); app-3 (rebuild plan: operator skills as product).

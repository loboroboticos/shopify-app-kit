---
name: tripwire
description: Write an offline test that fails a PR the moment two places in the repo disagree (a pin and a toml, a registry and its consumers, a docs map and the docs, a hand-written list and the workflows) and says exactly which file to fix and what to write. Use when a CLAUDE.md warning could be a check, when two files must stay in sync, when a review found drift, or when asked for a tripwire, parity test or drift test.
allowed-tools: Read, Grep, Glob, Write, Edit, Bash(node *), Bash(npm test*), Bash(pnpm test*), Bash(jq *), Bash(ls *), Bash(cat *)
---

# shopify-app-kit tripwire

A tripwire is a rot detector: a small offline test that reads every side of a fact that must agree and fails
with the repair in the message. It rides the build, so it never touches the network, a database or git. The
patterns and their failure messages are in `references/tripwire-patterns.md`; the line between a check and a
probe is in `references/checks-vs-probes.md`.

## Steps

1. **Read the manifest.** From `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json` take `checks.tripwireDir` (where
   tripwires live) and the sections the new check will read (`apiVersion.pins`, `paths.appTomls`,
   `webhooks.topics`, `deploy.targets`, whichever apply). The manifest is the single data binding most tripwires
   assert against; read it in the test rather than restating its values.

2. **Name the two (or more) sides.** Write down which files must agree and on what value: a version pin and a
   toml, a topic list and a handlers directory, an index and the files it indexes. If there is only one side,
   this is a lint rule, not a tripwire.

3. **Prefer extending an existing tripwire** in `checks.tripwireDir` that already reads one of the sides. One
   file per fact family (versions, webhooks, docs, workflows) keeps the repair messages together.

4. **Write the test.** Read every side with `fs`; compute the expected value once; on mismatch fail with a
   message naming the file and the exact string to write (keep a repair-string constant next to the assertion so
   the message and the fix cannot drift). Regex over source is fine when the message is precise. Allowlists of
   known debt only shrink: pair them with a second test that fails when an allowlisted entry no longer exists.

5. **Keep it offline.** No network, no database, no `git` (hosting builds run from shallow clones with no
   history; see `references/checks-vs-probes.md`). If the fact needs a live request, write a probe instead,
   name it `probe:*` and keep it out of the build.

6. **Point the doc at the check.** If a CLAUDE.md, rules file or reference doc carried the warning this test now
   enforces, replace the warning with one line naming the test (the `docs-owner` skill's rule). A warning nobody
   enforces is where drift hides.

7. **Run it twice**: once green, once with one side deliberately broken, and confirm the failure message is the
   repair. Then run the whole suite and report the file, the sides it reads and the repair string.

## References

- `references/tripwire-patterns.md`: the contract, allowlists that only shrink, and the patterns worth copying
  (single data binding, vendored-copy drift, docs-map completeness, scheduled-workflow liveness, manifest
  tripwire, registry parity, default-deny gate audit).
- `references/checks-vs-probes.md`: checks ride the build and are git-free and network-free; probes make real
  requests, run by hand, and never join the check chain.

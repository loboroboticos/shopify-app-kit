# Release

1. Bump `version` in `.claude-plugin/plugin.json`, `KIT_VERSION` in `hooks/lib.sh` (the `Cases:` line reads it)
   and every `# shopify-app-kit vX.Y.Z` header on line 2 of `hooks/*.sh` (the header test fails otherwise).
   `grep -rn "<old version>"` should then hit only `CHANGELOG.md`.
2. Add a `## X.Y.Z` section to `CHANGELOG.md`; the release notes are extracted from it verbatim.
3. Open a PR to `main`; merge when CI is green. Read the diff once more for repo literals (business names, store
   handles, product names), a reference not linked from its SKILL.md, and a stale `# shopify-app-kit v` header.
4. Do not tag. `.github/workflows/release-tag.yml` runs on the push to `main`, creates the annotated tag
   `vX.Y.Z` on the merge commit if it does not exist, and publishes the GitHub Release with the CHANGELOG
   section as its notes. An existing tag is a logged no-op. Never push a kit tag by hand; if the workflow did not
   run, fix the workflow and re-run it from the Actions tab rather than tagging locally.
5. Consumers then run `/shopify-app-kit:sync` and repoint their manifest's `$schema` at the new tag.

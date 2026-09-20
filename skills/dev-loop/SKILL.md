---
name: dev-loop
description: Start, run and cleanly stop a local Shopify app dev session against the dev registration named in this repo's .claude/shopify-app.json (the right --config, the right store, tunnel port in a sandbox, app dev clean at the end, theme work outside the app repo). Use when asked to run the app locally, preview a theme extension, start app dev, or when a dev session ended without cleaning up.
allowed-tools: Read, Grep, Glob, Bash(jq *), Bash(cat *), Bash(ls *), Bash(shopify app dev *), Bash(shopify theme pull *), Bash(shopify theme dev *), Bash(mkdir *), Bash(cd *)
---

# shopify-app-kit dev-loop

`shopify app dev` rewrites the dev registration's URLs to a throwaway tunnel and leaves them there. This skill
makes every session start with the right config and end with the registration restored. The traps behind each step
are in `references/cli-traps.md`; read it before the first session in a repo you have not run before.

## Steps

1. **Read the manifest.** From `${CLAUDE_PROJECT_DIR}/.claude/shopify-app.json` take `shopifyCli.configs.dev`,
   `shopifyCli.devPolicy`, `shopifyCli.deployPolicy`, `shopifyCli.themeDevFromRoot` and `paths.storeBindings`.
   Without a manifest, stop: the guard hooks will block a bare `app dev` anyway.

2. **Pick the store.** Read the bindings file at `paths.storeBindings`. When it has the shape
   `{ "default": "<key>", "stores": { "<key>": { "domain": "..." } } }`, the store is `stores[default].domain`.
   Any other shape, or no bindings file: ask the user for the store domain; never guess one.

3. **Start the dev server**, always with the config flag (the guard blocks the command without it):

   ```bash
   shopify app dev --config <configs.dev> --store <domain>
   ```

   Inside a sandboxed shell (a `!`-prefixed command) add `--theme-app-extension-port <port>`; the sandbox's
   network policy needs a fixed port. A plain terminal needs no port flag. If `devPolicy` is `operator-only`, say
   so and ask the maintainer to run it from their terminal instead.

4. **Never deploy from here.** `app dev` previews extensions through the tunnel; releasing them is the `release`
   skill's job. When `deployPolicy` is `operator-only`, say so rather than deploying.

5. **Theme work stays out of the app repo.** `shopify theme dev` from the app repo root is blocked when
   `themeDevFromRoot` is `block`. Pull the theme into a scratch directory and run it there:

   ```bash
   mkdir -p /tmp/theme-scratch && cd /tmp/theme-scratch && shopify theme pull --store <domain> && shopify theme dev --store <domain>
   ```

6. **End every session** with the clean command when the dev registration is shared with a hosted environment
   (a beta or preview deployment that uses the same client id):

   ```bash
   shopify app dev clean --config <configs.dev>
   ```

   `app dev` repoints the registration's `application_url` and redirect URLs to the tunnel; `clean` restores them.
   A session that exits without it leaves the hosted environment pointing at a dead tunnel, which looks like an
   outage. Run it even after a crash or a cancelled command.

7. **Report** which config and store you used, whether the port flag was needed, and that `clean` ran (or why it
   did not, so the maintainer can run it).

## References

- `references/cli-traps.md`: the four CLI traps (implicit default config, `automatically_update_urls_on_dev`,
  the expiring quick tunnel, the missing `clean`) and the handle-prefix rule for dev vs production extensions.

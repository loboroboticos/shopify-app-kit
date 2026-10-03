# Testing a theme app extension on a live storefront

What any app with a theme app extension needs to know to test its block on a real, password-protected development
store, from a laptop, from GitHub Actions or from a claude.ai cloud session. The kit ships this as knowledge, not
code: each app writes its own harness from it. The app keeps its specs, its block's selector and data
attributes, its catalog discovery and its store binding.

## Getting past the storefront password

A password-protected storefront redirects every request (HTML, `/products/<handle>.js`, `/cart.js`) to `/password`.

- **Mint the bypass cookie once per run.** POST to `<origin>/password`, urlencoded
  `form_type=storefront_password&password=<secret>`, with redirects **not** followed: success is HTTP 302 exactly.
  A 200 means a wrong password or a store that is not protected; a followed redirect also returns 200 and hides
  the difference.
- **The cookie is `_shopify_essential` or `storefront_digest`**, depending on the store. Take the first name in that
  order that is set with a non-empty value, and the **last** occurrence of it. A 302 with neither is a failure.
- **A 429 from `/password` is terminal.** The limit is per egress IP: never retry it in a loop. Wait, or run from
  another egress (a GitHub runner instead of a laptop).
- **Carry it as a one-cookie Playwright `storageState`**: a host-only domain (no leading dot, so it never reaches
  `127.0.0.1` or another origin), `origins: []` so no cart or localStorage is seeded, file mode `0600`, and written
  on every run (empty when the origin needs no bypass) so the config's `use.storageState` path always exists.
  Raw `fetch()` calls do not see the config's `use`; send the cookie to them as a `Cookie` header.
- **The password comes from one environment variable only.** It never reaches argv, a URL or a log line; a shell
  probe passes it to curl on stdin.

## Pinning an unpublished theme

`?preview_theme_id=<id>` on any storefront URL pins that theme **inside the bypass cookie**: the response sets a new
cookie, and the pin then sticks for every later request in the same cookie jar, invisible in the URL. So:

- replace the stored cookie with the one the pinning response sets;
- verify the pin, never assume it: the page's `Shopify.theme` id must equal the requested one;
- pin against the store's own origin. A `shopify theme dev` proxy cannot preview another theme.

## The placement probe

A dependency-free shell probe (curl, no browser) that fetches a product page past the password and answers "did the
block render, once, at the version just released?". It is the post-deploy check and a daily monitor.

- **Exactly once.** Count the block's wrapper element; zero is "not rendered", two or more is "placed twice" (a
  theme block and an app embed both active, or a duplicated section).
- **The served version.** A released extension's asset URLs carry the slug `<handle>-<N>`; assert `N` is the version
  just released. A `shopify app dev` session serves `dev-<uuid>` instead, so skip the slug check under a theme pin.
- **The required data attributes** the block's script reads, each present.
- **Distinct exit codes**, so CI and a person can tell the failures apart without reading output: 0 all present;
  1 password, cookie or fetch failure (including a pin that did not take); 2 usage; 3 throttled (429); 5 a marker
  missing or the block present more than once; higher codes for app-specific expectations.
- **A saved-page mode** (read a file instead of fetching) keeps the extraction and assertions testable offline.

## Launching a browser in a claude.ai cloud session

Three facts about the cloud image, each checked in a cloud session running Playwright 1.63:

1. **There is no Google Chrome**, so `channel: "chrome"` fails ("Chromium distribution 'chrome' is not found").
2. **The preinstalled Chromium is not the build the project's Playwright expects.** A default `launch()` looks for its
   own build under `PLAYWRIGHT_BROWSERS_PATH` (`/opt/pw-browsers`) and fails. Launch by path instead: read
   `CHROME_PATH`, pass it as `launchOptions.executablePath`, and drop `channel` when it is set. `CHROME_PATH` is
   `/opt/pw-browsers/chromium` (a symlink to the installed build); `chrome-launcher`, which Lighthouse uses, reads
   the same variable. Never run `playwright install` there.
3. **Chromium trusts the session's TLS-re-terminating egress proxy only through its NSS store** (`~/.pki/nssdb`),
   not the system CA bundle. When the store lacks the proxy's CA, every HTTPS page fails with
   `ERR_CERT_AUTHORITY_INVALID`, while curl and request-only suites keep working, which hides it. Check with
   `certutil -L -d sql:$HOME/.pki/nssdb` (the proxy's CA should be listed). When `certutil` is missing, the
   environment's setup script installs `libnss3-tools` and imports the proxy's CA bundle into that store.

## A Lighthouse budget for the block

The App Store review requirement: installing the app must not drop the storefront's weighted Lighthouse
performance score (Home 17%, Product 40%, Collection 43%) by more than 10 points.

- Score each page on two **unpublished copies** of the live theme, one with the block and one without, several
  runs each; compare medians. A negative delta (enabled − baseline) is a regression.
- A block that renders only on product templates has zero Home and Collection deltas, so the budget reduces to
  `|0.40 × ΔProduct| < 10`.
- Keep the weighting and the pass test in a pure module with a unit test; the Lighthouse run itself needs a browser.

## CI shape

- **One worker, no retries** for suites that share store inventory and carts: a retry re-runs half-applied state.
- **One concurrency group** for every job that drives the same store (the QA suite, the probe, Lighthouse), and a
  wait while an extension release is running; the release workflow keeps its own group so it never queues behind QA.
- **Never upload traces, `test-results/` or the storageState file**: traces record request headers, including the
  bypass cookie. Turn trace recording off in CI; upload only the HTML report.
- Failures open an issue through the kit's `failure-issue` action, with the reporter's summary and never a trace.
- An embedded-admin login (a staff account's storageState) is local only: never CI and never a cloud environment.

Sources: app-1 (storefront QA harness, probe script, QA workflows, Lighthouse budget doc).

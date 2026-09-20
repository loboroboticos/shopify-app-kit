<!-- docs/README-docs-map.md (shopify-app-kit template)
     The shape of the docs map. Paste the section below into the file the manifest names as docs.mapFile
     (usually README.md) under the heading docs.mapHeading (usually "## Docs map"), then delete this file.
     test/docs-consistency.test.mjs reads the same two manifest keys and fails when a file under docs/ has
     no row here. -->

## Docs map

One row per file under `docs/`. One owner per fact: a fact is stated in its owning document and linked from
everywhere else, never restated. Reference documents state the current rule and carry no dates; history goes
to `docs/history/` with the date in the file name; decisions go to `docs/adr/` as one record each.

| Document | Owns | Kind |
| --- | --- | --- |
| `docs/architecture.md` | Boundaries, layers, the data model, where each kind of code lives | reference |
| `docs/ops.md` | Deploy targets, the release steps, scheduled workflows and their liveness ritual, secrets and where they are set | reference |
| `docs/dev-loop.md` | Running the app locally, the dev registration, tunnels, `app dev clean` | reference |
| `docs/billing.md` | The billing method, plan and tier names, the test flag, the reconcile job | reference |
| `docs/adr/README.md` | The decision index; each numbered record under `docs/adr/` owns one decision | index |
| `docs/adr/SEEDS.md` | The decisions still to be taken before Phase 1; shrinks as records are written | index |
| `docs/history/` | Dated files: incidents, superseded rules, migrations of the docs themselves | history |

<!-- Rows for files that do not exist yet are a plan; delete them or create the file before merging. -->

# The tool manifest and its parity check

The consent page promises a list of tools; the server registers a list of tools. One file owns both lists, and
a check makes sure they are the same list.

## The manifest is the single source of truth for consent

A manifest module lists every MCP tool with its name, category, the minimum `roleLevel`, whether it reads or
writes, and a one-line description. The consent page renders the manifest filtered by the requested role; the
operator documentation is generated from it; the rate limiter reads the read/write flag from it. Nothing else
describes a tool.

Rule: adding a tool means adding a manifest row in the same change; the description on the consent page is
the manifest's, not the tool's docstring.

## Build-time parity check

A check (run in the verify gate and by `npm test`) loads the registered tools from the MCP server and the rows
from the manifest and asserts exact parity by name: a registered tool without a row would be invisible on the
consent page (the user grants access to something they were not told about); a row without a tool is a
dangling promise. The same check asserts each tool's `assertRole(n)` level equals the manifest's role column,
by reading the level the tool declares, and that a tool flagged `read` performs no write (a static scan of the
handler for the data layer's write functions).

Rule: the check fails the build, not a review; its output lists the mismatched names and which side is missing.

## No hard delete, and the count comes from the check

The check also asserts that no tool exposes a hard delete: a `delete_*` tool must call a soft-delete or
archive function, and the data layer's hard-delete functions are not reachable from any tool (the compliance
redaction path is the exception and lives outside the MCP surface). Documentation that states how many tools
the server has takes the number from the check's output, never from a hand count that drifts.

Rule: a "we have 47 tools" sentence in a doc is a tripwire target; the number is generated.

Sources: app-2 (contributor guide: manifest, parity script, no-hard-delete rule); app-3 (rebuild plan: consent surface).

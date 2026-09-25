export const meta = {
  name: 'release-readiness',
  description: 'Check a promotion range against the manifest before the promotion PR and return go, go-with-notes or no-go with a checklist',
  whenToUse: 'Use when the release skill is about to open the promotion PR (branches.promotion.from -> .to), or the operator asks whether a range is ready to ship: every release dimension the manifest enables (API version pins, webhook parity, migrations, the branch model, live billing, extensions, the App Store review) runs once, the findings are verified and ranked, and the result is a verdict plus a pasteable checklist for the PR body. Not a code review: run pre-pr-review for that.',
  phases: [
    { title: 'Scope', detail: 'manifest, promotion range, changed files, migrations, pins, tomls, extensions, workflows' },
    { title: 'Dimensions', detail: 'the release dimensions the manifest enables, in parallel, read-only' },
    { title: 'Verify', detail: 'one skeptic per blocker or major finding' },
  ],
}

// shopify-app-kit release-readiness
//
// Reads the consumer's .claude/shopify-app.json and the promotion range, then runs one read-only kit agent per
// release dimension the manifest enables, merges findings that cite the same location, sends every blocker and
// major to a skeptic that tries to refute it, and returns one verdict (go | go-with-notes | no-go) with the
// merged findings and a checklist block for the promotion PR body (the release skill's step 7 list, pre-ticked
// where a dimension passed). The launching session reports; nobody opens or posts to the PR from here.
//
// args (all optional): { base, head, pr, dimensions }
//   base        review this branch as the promotion target instead of branches.promotion.to
//   head        review this branch as the promotion source instead of branches.promotion.from
//   pr          a PR number; its body is read for acknowledgements
//   dimensions  restrict the run to these dimension names

// @shared constants
const SEVERITIES = ['blocker', 'major', 'minor', 'note']
const RANK = { blocker: 0, major: 1, minor: 2, note: 3 }
const LINE_FUZZ = 3 // findings on the same file within this many lines are one finding
const VERIFY_CAP = 12 // skeptics per run; the rest are reported unverified, never dropped
// @end

// The dimensions, the kit agent each runs as (name resolves as shopify-app-kit:<name>, agents/<name>.md) and when
// it runs. app-store-review launches nothing: it is one note telling the operator to run the companion's skill.
const DIMENSIONS = [
  { name: 'review-correctness', dimension: 'api-version', when: 'apiVersion' },
  { name: 'review-correctness', dimension: 'webhooks', when: 'webhooks' },
  { name: 'prisma-migration-reviewer', dimension: 'migrations', when: 'prisma' },
  { name: 'qa-review-security-governance', dimension: 'branch-model', when: 'always' },
  { name: 'review-correctness', dimension: 'billing', when: 'billing' },
  { name: 'storefront-extension-reviewer', dimension: 'extension', when: 'extensions' },
  { name: '', dimension: 'app-store-review', when: 'public' },
]

const opts = args && typeof args === 'object' ? args : {}

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    manifestFound: { type: 'boolean' },
    from: { type: 'string' },
    to: { type: 'string' },
    headRef: { type: 'string' },
    baseRef: { type: 'string' },
    pr: { type: 'string' },
    prBody: { type: 'string' },
    changedFiles: { type: 'array', items: { type: 'string' } },
    migrations: { type: 'array', items: { type: 'string' } },
    prismaPath: { type: 'string' },
    touchesPrisma: { type: 'boolean' },
    apiVersionExpected: { type: 'string' },
    pinFiles: { type: 'array', items: { type: 'string' } },
    tomls: { type: 'array', items: { type: 'string' } },
    webhookTopics: { type: 'array', items: { type: 'string' } },
    webhooksCompliance: { type: 'boolean' },
    webhookHandlers: { type: 'string' },
    extensions: { type: 'array', items: { type: 'string' } },
    extensionFiles: { type: 'array', items: { type: 'string' } },
    workflowFiles: { type: 'array', items: { type: 'string' } },
    protectedWorkflows: { type: 'array', items: { type: 'string' } },
    deployTargets: { type: 'string' },
    scaleToZeroBeforeMigrate: { type: 'boolean' },
    billingLive: { type: 'boolean' },
    billingMethod: { type: 'string' },
    billingTestFlag: { type: 'string' },
    appPublic: { type: 'boolean' },
    prodHandle: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['manifestFound', 'from', 'to', 'headRef', 'baseRef', 'pr', 'prBody', 'changedFiles', 'migrations', 'prismaPath',
    'touchesPrisma', 'apiVersionExpected', 'pinFiles', 'tomls', 'webhookTopics', 'webhooksCompliance', 'webhookHandlers',
    'extensions', 'extensionFiles', 'workflowFiles', 'protectedWorkflows', 'deployTargets', 'scaleToZeroBeforeMigrate',
    'billingLive', 'billingMethod', 'billingTestFlag', 'appPublic', 'prodHandle', 'notes'],
}

// The same finding shape as pre-pr-review, so the two workflows' outputs look alike.
// @shared findings-schema
const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: SEVERITIES },
          claim: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'integer' },
          section: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
        required: ['severity', 'claim', 'file', 'line', 'section', 'evidence', 'fix'],
      },
    },
    checked: { type: 'string' },
  },
  required: ['headline', 'findings', 'checked'],
}
// @end

// @shared verdict-schema
const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
    severity: { type: 'string', enum: SEVERITIES },
  },
  required: ['refuted', 'reason', 'severity'],
}
// @end

// ---------------------------------------------------------------------------------------------------------
phase('Scope')

const scope = await agent(`You are the read-only scoping pass for a release-readiness check of the current checkout. Do not modify any
file; do not create branches, stashes or worktrees. Gather the facts below with git, jq and (when installed) gh,
and return them in the structured shape requested.

1. Manifest: read \`.claude/shopify-app.json\` if it exists (manifestFound; when it does not, return every string
   empty, every array empty, every boolean false, and say so in notes). Copy out: \`paths.prisma\` (prismaPath),
   \`apiVersion.expected\` (apiVersionExpected), \`apiVersion.pins\` (pinFiles), \`paths.appTomls\` (tomls),
   \`webhooks.topics\` (webhookTopics), \`webhooks.compliance\` (webhooksCompliance), \`paths.webhookHandlers\`
   (webhookHandlers), \`paths.extensions\` (extensions), \`deploy.protectedWorkflows\` (protectedWorkflows),
   \`deploy.targets\` as one line "<name>: <workflow>" per target (deployTargets), \`deploy.scaleToZeroBeforeMigrate\`
   (scaleToZeroBeforeMigrate), \`billing.live\` (billingLive), \`billing.method\` (billingMethod),
   \`billing.testFlag\` (billingTestFlag), \`app.handles.prod\` (prodHandle).
2. The promotion range: from = ${opts.head ? `"${opts.head}" (the operator's choice)` : '`branches.promotion.from`, else `branches.default`, else the current branch'};
   to = ${opts.base ? `"${opts.base}" (the operator's choice)` : '`branches.promotion.to`, else the first entry of `branches.protected`, else `main`'}.
   Fetch both (\`git fetch origin <from> <to>\`); report the refs you diffed as headRef (\`origin/<from>\` when the
   fetch succeeded, else the local branch) and baseRef (\`origin/<to>\` likewise).
3. changedFiles: \`git diff <baseRef>...<headRef> --name-only\` (repo-relative). migrations: the changed files under
   any migrations/ directory or under prismaPath. touchesPrisma: any changed file under prismaPath, named
   schema.prisma, or under a migrations/ directory. extensionFiles: changed files under one of the extensions
   directories. workflowFiles: changed files under .github/workflows/.
4. PR: ${opts.pr ? `"${opts.pr}"` : 'the number of the open PR from <from> into <to> (`gh pr list --base <to> --head <from> --json number,body` when gh is installed and authenticated), else ""'};
   prBody: that PR's body when one exists, else "" (truncate to about 6000 characters and say so in notes).
5. appPublic: true when \`billing.method\` is app-pricing, or the app's toml or README says it is listed on the
   App Store or distributed publicly; false otherwise.
6. notes: anything a dimension should know (no manifest, gh missing, a ref that would not fetch, an empty range).`,
  { label: 'scope', phase: 'Scope', effort: 'low', schema: SCOPE_SCHEMA })

if (!scope) throw new Error('scoping pass returned nothing; cannot choose a range or the dimensions')
if (!scope.manifestFound) {
  log('no .claude/shopify-app.json in the checkout; release readiness is manifest-driven, so the answer is no-go')
  return { verdict: 'no-go', from: scope.from, to: scope.to, pr: scope.pr, findings: [], refuted: [], dimensions: [], skipped: [], failed: [],
    checklist: '- [ ] no manifest: add .claude/shopify-app.json (the README\'s manifest contract) and re-run the release-readiness workflow', notes: scope.notes }
}
if (scope.changedFiles.length === 0) {
  log(`no changes between ${scope.baseRef} and ${scope.headRef}; nothing to promote`)
  return { verdict: 'go', from: scope.from, to: scope.to, pr: scope.pr, findings: [], refuted: [], dimensions: [], skipped: [], failed: [],
    checklist: `- [x] ${scope.from} -> ${scope.to}: no changes; nothing to promote`, notes: scope.notes }
}
log(`${scope.headRef} -> ${scope.baseRef}: ${scope.changedFiles.length} files; ${scope.migrations.length} migration files; PR ${scope.pr || 'none'}`)

// ---------------------------------------------------------------------------------------------------------
// Pick the dimensions the manifest enables.
const wanted = Array.isArray(opts.dimensions) && opts.dimensions.length ? new Set(opts.dimensions) : null
const skipped = []
const selected = DIMENSIONS.filter((d) => {
  const skip = (reason) => { skipped.push({ dimension: d.dimension, reason }); return false }
  if (wanted && !wanted.has(d.dimension)) return skip('not in args.dimensions')
  switch (d.when) {
    case 'always': return true
    case 'apiVersion': return scope.apiVersionExpected ? true : skip('apiVersion.expected is absent')
    case 'webhooks': return (scope.webhookTopics.length > 0 || scope.webhooksCompliance) ? true : skip('webhooks section is absent')
    case 'prisma': return scope.touchesPrisma ? true : skip('the range does not touch paths.prisma, a schema.prisma or a migrations directory')
    case 'billing': return scope.billingLive ? true : skip('billing.live is false or absent')
    case 'extensions': return scope.extensions.length > 0 ? true : skip('paths.extensions is empty or absent')
    case 'public': return (scope.billingMethod === 'app-pricing' || scope.appPublic) ? true : skip('not a public app (billing.method is not app-pricing)')
    default: return false
  }
})
for (const s of skipped) log(`skipping ${s.dimension}: ${s.reason}`)

const list = (a) => (a.length ? a.map((f) => `  - ${f}`).join('\n') : '  (none)')
const common = `A release-readiness check of the promotion range ${scope.from} -> ${scope.to}. A scoping pass gathered the context
below; treat it as a starting point and verify it yourself from the checkout.

- range: \`git diff ${scope.baseRef}...${scope.headRef}\` (head ${scope.headRef}, base ${scope.baseRef}), PR: ${scope.pr || 'none'}
- manifest: .claude/shopify-app.json is present; read it first
- changed files (${scope.changedFiles.length}):
${list(scope.changedFiles)}
- PR body (acknowledgements live here):
${scope.prBody ? scope.prBody.split('\n').map((l) => `  ${l}`).join('\n') : '  (none)'}
${scope.notes ? `- notes: ${scope.notes}` : ''}

Do the check exactly as your own instructions say, on the one dimension named below only: read the cited files in
full from the checkout, run only read-only tooling against it, and never modify a file. Then return the structured
shape requested: your headline, one entry per finding (severity blocker|major|minor|note, a one-line claim, file
and line when the evidence is in the checkout, otherwise file "" and line 0 with the dimension name in section, the
evidence you read or ran, and a proposed fix), and one paragraph on what you checked and where you ran things.
An empty findings list still needs the headline and the checked paragraph.

Dimension: `

const PROMPTS = {
  'api-version': `api-version. Every file in apiVersion.pins must carry apiVersion.expected (${scope.apiVersionExpected}):
${list(scope.pinFiles)}
and every app toml's [webhooks] api_version must equal it:
${list(scope.tomls)}
A pin that differs, a pin file that does not exist, or a toml without the line is a blocker; a version bump mixed
into this range with unrelated changes is a major (a version bump is its own PR).`,
  webhooks: `webhooks. Every [[webhooks.subscriptions]] uri in the app tomls (${scope.tomls.join(', ') || 'none listed'}) must have
a handler under ${scope.webhookHandlers || 'the webhook handlers directory'}, every topic in webhooks.topics
(${scope.webhookTopics.join(', ') || 'none'}) must be subscribed, and${scope.webhooksCompliance ? ' the three compliance topics (customers/data_request, customers/redact, shop/redact) must have real handlers, never a 200 stub' : ' compliance handlers are not required by the manifest'}.
A subscribed topic without a handler, or a handler for a topic nobody subscribes, is a major; a missing compliance
handler is a blocker.`,
  migrations: `migrations. The range touches ${scope.prismaPath} (migration files: ${scope.migrations.join(', ') || 'none'}). No destructive
operation (DROP, TRUNCATE, a NOT NULL added without a default, a column or table removed) without an acknowledgement
in the PR body above; every schema.prisma edit has its migration and the reverse; no migration hand-edited after
generation. deploy.scaleToZeroBeforeMigrate is ${scope.scaleToZeroBeforeMigrate}: ${scope.scaleToZeroBeforeMigrate ? 'note in a finding of severity note that the release must scale the app to zero before the migration step' : 'no scale-to-zero step applies'}.`,
  'branch-model': `branch-model. The range must be exactly ${scope.from} -> ${scope.to}: no commit on ${scope.to} outside a merge
(\`git log ${scope.baseRef} --not ${scope.headRef} --no-merges --oneline\` should be empty; a commit there is a blocker
because the promotion would not carry it and a later merge would revert it). The protected workflows
(${scope.protectedWorkflows.join(', ') || 'none'}) must be untouched by the range, or the change to one must be
called out in the PR body (changed workflow files: ${scope.workflowFiles.join(', ') || 'none'}); an unreviewed change
to a protected workflow is a major.`,
  billing: `billing. billing.live is true: no tier, price or plan-name change in the range without it being called out in the
PR body (a tier or plan-name change is a data migration), and the billing test flag ${scope.billingTestFlag || ''} must
stay untouched in production configuration (a hard-coded or defaulted-on flag in the production path is a blocker).`,
  extension: `extension. paths.extensions: ${scope.extensions.join(', ')} (changed extension files: ${scope.extensionFiles.join(', ') || 'none'}).
Settings-schema backward compatibility for every changed block schema; when the manifest names a vendored-copy
parity check under checks.tripwireDir, run it read-only and report; the released version will be
${scope.prodHandle || '<handle>'}-<N> and must be verified in an asset URL after deploy (a finding of severity note).`,
}

// ---------------------------------------------------------------------------------------------------------
// Dimensions: a barrier is right here, because dedupe below needs every dimension's findings at once.
phase('Dimensions')
const launched = selected.filter((d) => d.name)
const reports = await parallel(launched.map((d) => () =>
  agent(common + PROMPTS[d.dimension], { agentType: `shopify-app-kit:${d.name}`, label: d.dimension, phase: 'Dimensions', schema: FINDINGS_SCHEMA })
    .then((out) => ({ dimension: d.dimension, out }))))

const dimensions = []
const failed = []
const raw = []
for (let i = 0; i < launched.length; i++) {
  const rep = reports[i]
  const d = launched[i]
  if (!rep || !rep.out) { failed.push(d.dimension); dimensions.push({ dimension: d.dimension, agent: d.name, status: 'failed' }); continue }
  dimensions.push({ dimension: d.dimension, agent: d.name, status: 'ran', headline: rep.out.headline, checked: rep.out.checked, count: rep.out.findings.length })
  for (const f of rep.out.findings) raw.push({ ...f, dimension: d.dimension, reviewer: d.name })
}
if (selected.some((d) => d.dimension === 'app-store-review')) {
  dimensions.push({ dimension: 'app-store-review', agent: '', status: 'note' })
  raw.push({ severity: 'note', claim: 'Run the companion\'s shopify-app-store-review skill on this range before opening the promotion PR and attach its summary to the PR body',
    file: '', line: 0, section: 'app-store-review', evidence: `billing.method ${scope.billingMethod || 'unset'}; appPublic ${scope.appPublic}`,
    fix: 'Install shopify-ai-toolkit@claude-plugins-official when absent and say "companion not installed" in the PR body otherwise', dimension: 'app-store-review', reviewer: 'release-readiness' })
}
for (const f of failed) log(`dimension ${f} returned nothing (skipped or failed); it is uncovered and the verdict cannot be go`)
log(`${raw.length} raw findings from ${dimensions.length} dimensions`)

// ---------------------------------------------------------------------------------------------------------
// A file-less finding's section is its dimension name, so two distinct claims in one dimension stay apart; the
// dimensions a finding came from are carried through the merge.
const TOPIC_NEEDS_SAME_CLAIM = true
const mergeExtra = (prev, f) => { if (!prev.dimensions.includes(f.dimension)) prev.dimensions.push(f.dimension) }
const newExtra = (f) => ({ dimensions: [f.dimension] })
// @shared dedupe
// Dedupe in plain code: same file within LINE_FUZZ lines, or the same normalised section/claim when there is no
// file. TOPIC_NEEDS_SAME_CLAIM, mergeExtra and newExtra are declared by each workflow just above this block.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80)
const sorted = raw.slice().sort((a, b) => (a.file || '~').localeCompare(b.file || '~') || (a.line || 0) - (b.line || 0) || norm(a.section || a.claim).localeCompare(norm(b.section || b.claim)))
const merged = []
for (const f of sorted) {
  const prev = merged[merged.length - 1]
  const sameSpot = prev && f.file && prev.file === f.file && Math.abs((f.line || 0) - (prev.line || 0)) <= LINE_FUZZ
  const sameTopic = prev && !f.file && !prev.file && norm(f.section || f.claim) === norm(prev.section || prev.claim) && (!TOPIC_NEEDS_SAME_CLAIM || norm(f.claim) === norm(prev.claim))
  if (sameSpot || sameTopic) {
    if (RANK[f.severity] < RANK[prev.severity]) { prev.severity = f.severity; prev.claim = f.claim; prev.fix = f.fix }
    mergeExtra(prev, f)
    if (!prev.reviewers.includes(f.reviewer)) prev.reviewers.push(f.reviewer)
    if (!prev.claims.includes(f.claim)) prev.claims.push(f.claim)
    if (f.evidence && !prev.evidence.includes(f.evidence)) prev.evidence = `${prev.evidence}\n${f.evidence}`
    continue
  }
  merged.push({ severity: f.severity, claim: f.claim, file: f.file, line: f.line, section: f.section, evidence: f.evidence,
    fix: f.fix, ...newExtra(f), reviewers: [f.reviewer], claims: [f.claim] })
}
log(`${merged.length} findings after dedupe`)
// @end

// ---------------------------------------------------------------------------------------------------------
// Verify: one skeptic per blocker or major, capped; a refuted finding is kept as a note with the reason.
phase('Verify')
const serious = merged.filter((f) => f.severity === 'blocker' || f.severity === 'major')
const toVerify = serious.slice(0, VERIFY_CAP)
if (serious.length > VERIFY_CAP) log(`verifying ${VERIFY_CAP} of ${serious.length} serious findings; the rest are reported unverified`)

const verdicts = await parallel(toVerify.map((f, i) => () =>
  agent(`Try to refute this release-readiness finding on the range ${scope.from} -> ${scope.to} (diff \`git diff ${scope.baseRef}...${scope.headRef}\`).
You are read-only: read the cited files and their surroundings, run only tooling that writes nothing, never modify
a file, never create a branch, stash or worktree.

Finding [${f.severity}] ${f.file ? `${f.file}:${f.line}` : f.section} — ${f.claim}
Dimension: ${f.dimensions.join(', ')} (raised by ${f.reviewers.join(', ')})
Evidence: ${f.evidence}
Proposed fix: ${f.fix}
PR body: ${scope.prBody ? scope.prBody.slice(0, 2000) : '(none)'}

Return refuted=true only when you can show, with evidence from the checkout or the PR body, that the claim is
wrong, already handled or acknowledged, or outside this range (pre-existing and untouched). Return refuted=false
when it stands, even partly. Either way give the reason and the severity you would assign (blocker | major | minor | note).`,
    { label: `verify:${f.file ? f.file.split('/').pop() : f.section}#${i + 1}`, phase: 'Verify', schema: VERDICT_SCHEMA })))

// @shared skeptic-apply
const refuted = []
toVerify.forEach((f, i) => {
  const v = verdicts[i]
  if (!v) { f.verification = 'unverified (skeptic returned nothing)'; return }
  if (v.refuted) {
    refuted.push({ ...f, reason: v.reason })
    f.severity = 'note'
    f.verification = `refuted: ${v.reason}`
    return
  }
  f.verification = `confirmed: ${v.reason}`
  if (RANK[v.severity] > RANK[f.severity]) f.verification += ` (skeptic would rate it ${v.severity})`
})
for (const f of serious.slice(VERIFY_CAP)) f.verification = 'unverified (over the skeptic cap)'
for (const f of merged) if (!f.verification) f.verification = 'not verified (minor or note)'
// @end

// ---------------------------------------------------------------------------------------------------------
// Verdict: no-go on a surviving blocker; go only when every dimension ran clean; go-with-notes otherwise.
// @shared verdict-counts
merged.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.file || '~').localeCompare(b.file || '~') || (a.line || 0) - (b.line || 0) || norm(a.section).localeCompare(norm(b.section)))
const counts = { blocker: 0, major: 0, minor: 0, note: 0 }
for (const f of merged) counts[f.severity]++
// @end
const verdict = counts.blocker > 0 ? 'no-go' : (merged.length > 0 || failed.length > 0) ? 'go-with-notes' : 'go'
log(`verdict: ${verdict} (${counts.blocker} blocker, ${counts.major} major, ${counts.minor} minor, ${counts.note} note; ${refuted.length} refuted; ${failed.length} failed)`)

// The checklist for the PR body: the release skill's step 7 list plus one line per dimension, pre-ticked where the
// dimension ran and raised nothing above a note.
const passed = (id) => dimensions.some((d) => d.dimension === id && d.status === 'ran') && !merged.some((f) => f.dimensions.includes(id) && RANK[f.severity] <= RANK.minor)
const ran = (id) => dimensions.some((d) => d.dimension === id)
// A dimension that ran clean is ticked; one the manifest does not enable is ticked as not applicable; a failed one
// or one with a finding stays open.
const box = (id) => (ran(id) ? (passed(id) ? '- [x]' : '- [ ]') : '- [x]')
const checklist = [
  `release-readiness: ${verdict} (${counts.blocker} blocker, ${counts.major} major, ${counts.minor} minor, ${counts.note} note${failed.length ? `; uncovered: ${failed.join(', ')}` : ''})`,
  `- [ ] CI green on ${scope.from}; migrate diff clean; tripwires green`,
  `${box('api-version')} API version pins agree on ${scope.apiVersionExpected || '<apiVersion.expected>'}${ran('api-version') ? '' : ' (not applicable: apiVersion.expected absent)'}`,
  `${box('webhooks')} Webhook topics subscribed and handled; compliance handlers present${ran('webhooks') ? '' : ' (not applicable: no webhooks section)'}`,
  `${box('branch-model')} Branch model: range is ${scope.from} -> ${scope.to}; protected workflows untouched or reviewed`,
  ran('app-store-review')
    ? '- [ ] App Store review check (public app): summary attached / companion not installed'
    : `- [x] App Store review check: not applicable (billing.method ${scope.billingMethod || 'unset'}, not a public app)`,
  ran('migrations')
    ? `${box('migrations')} Migration in this release: ${scope.migrations.length} file(s); scale to zero first (scaleToZeroBeforeMigrate): ${scope.scaleToZeroBeforeMigrate ? 'yes' : 'no'}`
    : '- [x] Migration in this release: none',
  ran('extension')
    ? `- [ ] Extension version to release: ${scope.prodHandle || '<handle>'}-<N>; verified in an asset URL after deploy${passed('extension') ? ' (settings compatibility checked)' : ''}`
    : '- [x] Extension version to release: none (paths.extensions empty)',
  `- [ ] Server target(s): ${scope.deployTargets ? scope.deployTargets.split('\n').join('; ') : '<workflow> on push to <branch>'}`,
  ran('billing')
    ? `${box('billing')} Billing live: no plan or price change in this release / change reviewed`
    : `- [x] Billing live: no (billing.live ${scope.billingLive})`,
  '- [ ] app dev clean run on the dev registration',
].join('\n')

return {
  verdict,
  from: scope.from,
  to: scope.to,
  headRef: scope.headRef,
  baseRef: scope.baseRef,
  pr: scope.pr,
  counts,
  findings: merged,
  refuted,
  dimensions,
  skipped,
  failed,
  checklist,
  notes: scope.notes,
}

export const meta = {
  name: 'pre-pr-review',
  description: 'Run the diff-stage review roster on the current branch in one go and dedupe the findings into one verdict',
  whenToUse: 'Use when a branch is about to become a pull request, or a PR is about to be merged or promoted, and you want every diff-stage reviewer (qa-review-*, review-quality, prisma-migration-reviewer, storefront-extension-reviewer) run once with the findings merged, verified and ranked; splice the returned receipt into the PR body (the review skill\'s references/receipt.md). Not for plans: run plan-review on a plan instead. Not a release check: run release-readiness on a promotion range.',
  phases: [
    { title: 'Scope', detail: 'manifest, base branch, diff, PR body or plan file' },
    { title: 'Review', detail: 'the diff-stage roster in parallel, read-only' },
    { title: 'Verify', detail: 'one skeptic per blocker or major finding' },
  ],
}

// shopify-app-kit pre-pr-review
//
// Launches the diff-stage reviewers the kit ships under agents/ (each read-only, each reading the consumer's
// .claude/shopify-app.json first) on the current branch, merges findings that cite the same location, sends
// every blocker and major to a skeptic that tries to refute it, and returns one verdict on the review skill's
// scale (block | changes-needed | approve). The launching session reports; nobody posts to the PR.
//
// args (all optional): a base-branch string, or { base, pr, reviewers, all, models, independent, independentFiles, delta, reviewerSession }
//   base       review against this branch instead of the manifest's choice
//   pr         a PR number; its base and body are used
//   reviewers  restrict the roster to these agent names
//   all        true forces the stack reviewers to run even when the diff does not touch their files
//   independent  true: the outsider mode the independent-review skill runs; intent from the linked issue and the
//              house rules only (never the PR body), review-correctness and an efficiency pass join, and an
//              adversarial pass runs on independentFiles (the changed independentFor paths, from review-gate.mjs)
//   delta      { receipt }: re-check only receipt.sha..HEAD against the earlier findings (args.findings, text);
//              the returned receipt extends receipt's chain (kind delta, or independent-delta)
//   models     model overrides by role { scope, reviewer, skeptic, judgment } or by agent name

// @shared constants
const SEVERITIES = ['blocker', 'major', 'minor', 'note']
const RANK = { blocker: 0, major: 1, minor: 2, note: 3 }
const LINE_FUZZ = 3 // findings on the same file within this many lines are one finding
const VERIFY_CAP = 12 // skeptics per run; the rest are reported unverified, never dropped
// @end

// The roster and when each reviewer runs. Names resolve as shopify-app-kit:<name> (agents/<name>.md).
const ROSTER = [
  { name: 'qa-review-security-governance', when: 'always' },
  { name: 'qa-review-spec-conformance', when: 'always' },
  { name: 'qa-review-technical-integrity', when: 'always', focus: 'review-quality covers structure, simplification, layers and file size in this run; report those only when they cause a defect.' },
  { name: 'review-quality', when: 'always', focus: 'qa-review-technical-integrity covers performance, reliability, observability and tests in this run; report structure, simplification, layer boundaries, file size and conventions only.' },
  { name: 'qa-review-usability', when: 'always' },
  { name: 'qa-review-divergence-hunter', when: 'always' },
  { name: 'prisma-migration-reviewer', when: 'prisma' },
  { name: 'storefront-extension-reviewer', when: 'extensions' },
  { name: 'review-correctness', when: 'independent' },
  { pass: 'efficiency-pass', agent: 'qa-review-technical-integrity', when: 'independent', focus: 'This is the efficiency pass only: count Admin API calls per hot path (loader, action, webhook, job), database writes per request, N+1 queries, cache churn and invalidation, and asset or bundle size on storefront paths; cite each with file:line and an estimate.' },
  { pass: 'adversarial-pass', agent: 'qa-review-security-governance', when: 'risky', focus: 'This is the adversarial pass: assume the change to the files listed under "independentFor files" is wrong and try to break it (redirect and auth loops, replayed or reordered webhooks, partial writes, mass updates, entitlement or billing state that diverges from Shopify). Report only what you can show.' },
]

const opts = typeof args === 'string' ? { base: args } : (args && typeof args === 'object' ? args : {})
const SHA = /^[0-9a-f]{40}$/
const prior = opts.delta && typeof opts.delta === 'object' && opts.delta.receipt && SHA.test(opts.delta.receipt.sha || '') ? opts.delta.receipt : null
if (opts.delta && !prior) throw new Error('args.delta needs { receipt } with the earlier receipt and its 40-hex sha')
const riskyFiles = Array.isArray(opts.independentFiles) ? opts.independentFiles.filter((f) => typeof f === 'string' && f) : []

const SCOPE_MODEL = 'haiku' // the scoping pass's default model
// Every agent() names its model by role; args.models ({ scope, reviewer, skeptic, judgment } or an agent name) overrides any.
// @shared models
const JUDGMENT = new Set(['design-review-architecture', 'design-review-feasibility', 'design-review-product-intent', 'design-review-risk-governance', 'qa-review-divergence-hunter', 'qa-review-security-governance'])
const MODELS = { scope: SCOPE_MODEL, reviewer: 'sonnet', skeptic: 'sonnet', judgment: 'sonnet' }
const BY_AGENT = Object.create(null) // an agent-name key (review-gate.mjs models maps the manifest's review.models here)
for (const [k, v] of Object.entries(opts.models && typeof opts.models === 'object' ? opts.models : {})) {
  if (typeof v !== 'string' || !v) continue
  if (Object.hasOwn(MODELS, k)) MODELS[k] = v
  else if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(k)) BY_AGENT[k] = v
}
const modelFor = (name) => BY_AGENT[name] ?? (JUDGMENT.has(name) ? MODELS.judgment : MODELS.reviewer)
// @end

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    manifestFound: { type: 'boolean' },
    base: { type: 'string' },
    baseRef: { type: 'string' },
    head: { type: 'string' },
    headSha: { type: 'string' },
    pr: { type: 'string' },
    changedFiles: { type: 'array', items: { type: 'string' } },
    diffStat: { type: 'string' },
    intentSource: { type: 'string' },
    intent: { type: 'string' },
    touchesPrisma: { type: 'boolean' },
    extensionsDeclared: { type: 'boolean' },
    touchesExtensions: { type: 'boolean' },
    refsResolved: { type: 'boolean' },
    houseRules: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['manifestFound', 'base', 'baseRef', 'head', 'headSha', 'pr', 'houseRules', 'changedFiles', 'diffStat', 'intentSource', 'intent',
    'touchesPrisma', 'extensionsDeclared', 'touchesExtensions', 'refsResolved', 'notes'],
}

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

const scope = await agent(`You are the read-only scoping pass for a pre-PR review of the current checkout. Do not modify any file; do not
create branches, stashes or worktrees. Gather the facts below with git, jq and (when installed) gh, and return them
in the structured shape requested.

1. Manifest: read \`.claude/shopify-app.json\` if it exists (manifestFound). Note \`branches.default\`,
   \`branches.promotion\`, \`paths.prisma\` and \`paths.extensions\`.
2. Base branch, in this order: ${opts.base ? `the operator asked for "${opts.base}";` : ''} ${opts.pr ? `PR #${opts.pr}'s base (\`gh pr view ${opts.pr} --json baseRefName,number${opts.independent ? '' : ',body'}\`);` : ''}
   \`branches.promotion.to\` when the current branch equals \`branches.promotion.from\`; else \`branches.default\`;
   else \`main\`. Report the name as \`base\` and the ref you diffed against as \`baseRef\` (\`origin/<base>\` after
   \`git fetch origin <base>\` succeeds, else the local \`<base>\`).
3. Head: \`git rev-parse --abbrev-ref HEAD\` (head) and \`git rev-parse HEAD\` (headSha, 40 hex). ${prior ? `This is a delta
   re-check: diff \`${prior.sha}..HEAD\` instead of \`<baseRef>...HEAD\` below (still report base and baseRef).` : ''} Diff:
   \`git diff <baseRef>...HEAD --stat\` (diffStat) and \`git diff <baseRef>...HEAD --name-only\` (changedFiles, repo-relative).
4. PR: ${opts.pr ? `"${opts.pr}"` : `the number of the open PR for this head branch (\`gh pr view --json number${opts.independent ? '' : ',body'}\` when gh is installed and authenticated), else ""`}.
5. Intent: ${opts.independent ? `this is an independent review, so never the PR body or any session transcript: the first issue in
   \`gh pr view <pr> --json closingIssuesReferences\` (\`gh issue view <n> --json title,body\`; intentSource "issue #<n>"),
   else intentSource "none" and intent "".` : `the PR body when a PR exists (intentSource "PR #<n> body"); else the contents of a plan file this branch
   adds or changes (a markdown file whose path or name contains "plan", or under docs/plans/ or plans/;
   intentSource "plan file <path>"); else intentSource "none" and intent "".`} Truncate intent to about 6000
   characters and say so in notes if you did. houseRules: the repo's CLAUDE.md and .claude/rules/*.md paths that exist.
6. touchesPrisma: any changed file under \`paths.prisma\`, or named schema.prisma, or under a migrations/
   directory. extensionsDeclared: \`paths.extensions\` is a non-empty array. touchesExtensions: any changed file
   under one of the \`paths.extensions\` directories.
7. refsResolved: true only when \`git rev-parse --verify <baseRef>\` succeeded and the diff ran; false when the base
   ref is missing or the diff failed (an empty changedFiles then means "unknown", not "no changes").
8. notes: anything a reviewer should know (no manifest, gh missing, base ref missing, diff empty).`,
  { label: 'scope', phase: 'Scope', effort: 'low', model: MODELS.scope, schema: SCOPE_SCHEMA })

if (!scope) throw new Error('scoping pass returned nothing; cannot choose a base or a roster')
if (!SHA.test(scope.headSha || '')) throw new Error(`the scoping pass returned no 40-hex head sha (${scope.headSha}); a receipt must name the commit it reviewed`)
if (!scope.refsResolved) {
  log(`the base ${scope.baseRef || scope.base || '(none)'} did not resolve, so the diff is unknown; nothing can be approved`)
  return { verdict: 'changes-needed', base: scope.base, head: scope.head, pr: scope.pr, findings: [], reviewers: [], skipped: [], receipt: null, notes: `${scope.notes ? `${scope.notes}; ` : ''}base ref did not resolve; no receipt` }
}
if (scope.changedFiles.length === 0) {
  log(`no changes between ${prior ? prior.sha.slice(0, 7) : scope.baseRef} and ${scope.head}; nothing to review`)
  // An empty delta to a new head (a merge that changed nothing) still extends the chain; otherwise there is nothing to attest.
  const receipt = prior && prior.sha !== scope.headSha ? { v: 1, kind: opts.independent ? 'independent-delta' : 'delta', sha: scope.headSha, base: scope.base, verdict: 'approve', confirmed: 0, roster: [], independent: Array.isArray(prior.independent) ? prior.independent : null,
    fromSha: prior.sha, chain: [...(Array.isArray(prior.chain) ? prior.chain : []), { kind: prior.kind, sha: prior.sha, ...(prior.fromSha ? { fromSha: prior.fromSha } : {}) }] } : null
  return { verdict: 'approve', base: scope.base, head: scope.head, pr: scope.pr, findings: [], reviewers: [], skipped: [], receipt, notes: scope.notes }
}
log(`${scope.head} vs ${scope.baseRef}: ${scope.changedFiles.length} files; intent from ${scope.intentSource}`)

// ---------------------------------------------------------------------------------------------------------
// Pick the roster. A delta re-checks with the reviewers named in args.reviewers, by default two.
const wanted = Array.isArray(opts.reviewers) && opts.reviewers.length ? new Set(opts.reviewers)
  : prior ? new Set(['qa-review-technical-integrity', 'qa-review-security-governance', ...(opts.independent && riskyFiles.length ? ['adversarial-pass'] : [])]) : null
const skipped = []
const selected = ROSTER.map((r) => ({ ...r, name: r.name || r.pass, agent: r.agent || r.name })).filter((r) => {
  if ((r.when === 'independent' || r.when === 'risky') && !opts.independent) return false // outsider mode only
  if (wanted && !wanted.has(r.name)) { skipped.push({ name: r.name, reason: 'not in args.reviewers' }); return false }
  if (r.when === 'risky' && !riskyFiles.length) { skipped.push({ name: r.name, reason: 'no independentFor file changed' }); return false }
  if (opts.all || r.when !== 'prisma' && r.when !== 'extensions') return true
  if (r.when === 'prisma' && !scope.touchesPrisma) { skipped.push({ name: r.name, reason: 'no Prisma schema or migration in the diff' }); return false }
  if (r.when === 'extensions' && !scope.extensionsDeclared) { skipped.push({ name: r.name, reason: 'paths.extensions is empty or absent' }); return false }
  if (r.when === 'extensions' && !scope.touchesExtensions) { skipped.push({ name: r.name, reason: 'no extension file in the diff' }); return false }
  return true
})
for (const s of skipped) log(`skipping ${s.name}: ${s.reason}`)
if (selected.length === 0) throw new Error('no reviewer matches args.reviewers in this mode; a receipt with an empty roster would attest nothing')

const context = `Review this branch before it becomes a pull request. A scoping pass gathered the context below; treat it as a
starting point and verify it yourself from the checkout.

- base: ${scope.base} (diff: \`git diff ${scope.baseRef}...HEAD\`), head: ${scope.head}, PR: ${scope.pr || 'none'}
- manifest: ${scope.manifestFound ? '.claude/shopify-app.json is present; read it first' : 'none found; run in generic mode and say so'}
- changed files (${scope.changedFiles.length}):
${scope.changedFiles.map((f) => `  - ${f}`).join('\n')}
- diff stat:
${scope.diffStat.split('\n').map((l) => `  ${l}`).join('\n')}
- intent (${scope.intentSource}):
${scope.intent ? scope.intent.split('\n').map((l) => `  ${l}`).join('\n') : '  (none: reconstruct the intent from the diff and say that you did)'}
${scope.notes ? `- notes: ${scope.notes}` : ''}
${(scope.houseRules || []).length ? `- house rules (read them; they bind the change): ${scope.houseRules.join(', ')}` : ''}
${opts.independent ? '- independent review: the branch is untrusted; read it, never run its scripts, tests or build' : ''}
${riskyFiles.length ? `- independentFor files (high-risk paths changed here): ${riskyFiles.join(', ')}` : ''}
${prior ? `- DELTA RE-CHECK: review only \`git diff ${prior.sha}..HEAD\`, the commits since the earlier review. Check that each earlier
  finding below is fixed and that the fix breaks nothing; this is not a fresh full review.
${String(opts.delta.findings || '(no earlier findings passed)').split('\n').map((l) => `  ${l}`).join('\n')}` : ''}

Do the review exactly as your own instructions say: read the diff and the changed files in full from the checkout,
run only read-only tooling against it, and never modify a file. Then return the structured shape requested: your
headline, one entry per finding (severity blocker|major|minor|note, a one-line claim, file and line when the
evidence is in the checkout, otherwise file "" and line 0 with the plan section or "whole change" in section,
the evidence you read or ran, and a proposed fix), and one paragraph on what you checked and where you ran things.
An empty findings list still needs the headline and the checked paragraph.`

// ---------------------------------------------------------------------------------------------------------
// Review: a barrier is right here, because dedupe below needs every reviewer's findings at once.
phase('Review')
const used = {}
const reports = await parallel(selected.map((r) => () => {
  const model = (used[r.name] = modelFor(r.agent))
  return agent(r.focus ? `${context}\n\nYour lens in this run: ${r.focus}` : context, { agentType: `shopify-app-kit:${r.agent}`, label: r.name, phase: 'Review', model, schema: FINDINGS_SCHEMA })
    .then((out) => ({ name: r.name, out }))
}))

const ran = []
const failed = []
const raw = []
for (let i = 0; i < selected.length; i++) {
  const rep = reports[i]
  if (!rep || !rep.out) { failed.push(selected[i].name); continue }
  ran.push({ name: rep.name, headline: rep.out.headline, checked: rep.out.checked, count: rep.out.findings.length })
  for (const f of rep.out.findings) raw.push({ ...f, reviewer: rep.name })
}
for (const f of failed) log(`reviewer ${f} returned nothing (skipped or failed); its lens is uncovered`)
log(`${raw.length} raw findings from ${ran.length} reviewers`)

// ---------------------------------------------------------------------------------------------------------
// Two reviewers on the same file-less section ("whole change") are one finding; nothing extra is carried.
const TOPIC_NEEDS_SAME_CLAIM = false
const mergeExtra = () => {}
const newExtra = () => ({})
// @shared dedupe
// Dedupe in plain code: same file within LINE_FUZZ lines, or the same normalised section/claim when there is no
// file. TOPIC_NEEDS_SAME_CLAIM, mergeExtra and newExtra are declared by each workflow just above this block.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80)
const sorted = raw.slice().sort((a, b) => (a.file || '~').localeCompare(b.file || '~') || (a.line || 0) - (b.line || 0) || norm(a.section || a.claim).localeCompare(norm(b.section || b.claim)))
const merged = []
for (const f of sorted) {
  const prev = merged[merged.length - 1]
  // Two blockers or majors merge only when they make the same claim: the skeptic judges the entry's lead claim, and a
  // refutation must never carry a different serious defect down with it (#117). A serious finding still absorbs a
  // nearby minor or note, which only leads when nothing serious is there.
  const mergeable = prev && (norm(f.claim) === norm(prev.claim) || RANK[f.severity] > RANK.major || RANK[prev.severity] > RANK.major)
  const sameSpot = mergeable && f.file && prev.file === f.file && Math.abs((f.line || 0) - (prev.line || 0)) <= LINE_FUZZ
  const sameTopic = mergeable && !f.file && !prev.file && norm(f.section || f.claim) === norm(prev.section || prev.claim) && (!TOPIC_NEEDS_SAME_CLAIM || norm(f.claim) === norm(prev.claim))
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
  agent(`Try to refute this review finding on branch ${scope.head} (diff against ${scope.baseRef}). You are read-only:
read the cited code and its surroundings, run only tooling that writes nothing, never modify a file, never create a
branch, stash or worktree.

Finding [${f.severity}] ${f.file ? `${f.file}:${f.line}` : f.section} — ${f.claim}${f.claims.length > 1 ? `
Merged here (nearby or same-section findings; each is its own claim):
${f.claims.map((c) => `- ${c}`).join('\n')}` : ''}
Raised by: ${f.reviewers.join(', ')}
Evidence: ${f.evidence}
Proposed fix: ${f.fix}

Return refuted=true only when you can show, with evidence from the checkout, that every claim listed is wrong,
already handled, or out of this branch's scope (pre-existing and untouched). Return refuted=false when any claim
stands, even partly. Either way give the reason and the severity you would assign (blocker | major | minor | note).`,
    { label: `verify:${f.file ? f.file.split('/').pop() : 'whole'}#${i + 1}`, phase: 'Verify', model: MODELS.skeptic, schema: VERDICT_SCHEMA })))

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
// Verdict on the review skill's scale.
// @shared verdict-counts
merged.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.file || '~').localeCompare(b.file || '~') || (a.line || 0) - (b.line || 0) || norm(a.section).localeCompare(norm(b.section)))
const counts = { blocker: 0, major: 0, minor: 0, note: 0 }
for (const f of merged) counts[f.severity]++
// @end
// A reviewer that returned nothing left its lens uncovered, so the diff is never approved on its account.
const verdict = counts.blocker > 0 ? 'block' : (counts.major > 0 || failed.length > 0) ? 'changes-needed' : 'approve'
log(`verdict: ${verdict} (${counts.blocker} blocker, ${counts.major} major, ${counts.minor} minor, ${counts.note} note; ${refuted.length} refuted${failed.length ? `; uncovered: ${failed.join(', ')}` : ''})`)

// The receipt (format and checks: hooks/review-gate.mjs, the one source of truth); the session splices it into the PR body.
const kind = prior ? (opts.independent ? 'independent-delta' : 'delta') : (opts.independent ? 'independent' : 'pre-pr-review')
const receipt = { v: 1, kind, sha: scope.headSha, base: scope.base, verdict, confirmed: counts.blocker + counts.major, counts,
  roster: ran.map((r) => r.name), models: { ...used, skeptic: MODELS.skeptic }, independent: prior && Array.isArray(prior.independent) ? prior.independent : null }
if (prior) Object.assign(receipt, { fromSha: prior.sha, chain: [...(Array.isArray(prior.chain) ? prior.chain : []), { kind: prior.kind, sha: prior.sha, ...(prior.fromSha ? { fromSha: prior.fromSha } : {}) }] })
if (typeof opts.reviewerSession === 'string' && opts.reviewerSession) receipt.reviewerSession = opts.reviewerSession.slice(0, 200)

return {
  verdict,
  base: scope.base,
  baseRef: scope.baseRef,
  head: scope.head,
  pr: scope.pr,
  intentSource: scope.intentSource,
  counts,
  findings: merged,
  refuted,
  reviewers: ran,
  skipped,
  failed,
  receipt,
  notes: scope.notes,
}

export const meta = {
  name: 'plan-review',
  description: 'Run the four plan-stage design reviewers on a plan file, PR body or issue and merge the findings into one verdict',
  whenToUse: 'Use when a plan file, ADR, PR description or issue describes a change that has not been built yet and you want it challenged before code exists: the four design-review-* agents (architecture, feasibility, product-intent, risk-governance) run once in parallel, the findings are merged, verified and ranked, and the result is a verdict (sound | revise | rethink) plus the decisions the plan should record as ADRs. Not for a diff: run pre-pr-review on a built change.',
  phases: [
    { title: 'Scope', detail: 'the plan text, the manifest facts it touches, the ADR directory' },
    { title: 'Review', detail: 'the four plan-stage reviewers in parallel, read-only' },
    { title: 'Verify', detail: 'one skeptic per blocker or major finding' },
  ],
}

// shopify-app-kit plan-review
//
// Launches the plan-stage reviewers the kit ships under agents/ (each read-only, each reading the consumer's
// .claude/shopify-app.json first) on a plan, merges findings that cite the same section, sends every blocker and
// major to a skeptic that tries to refute it, and returns one verdict (sound | revise | rethink) with the merged
// findings and the decisions the plan should record as ADRs (any finding a reviewer tags adr: true). The launching
// session reports; nobody edits the plan or posts to the PR or issue.
//
// args: a string (a path to a markdown plan file, a PR number whose body is the plan, or "#<n>" / an issue number)
//       or { plan, pr, issue, reviewers }
//   plan       path to the plan file
//   pr         a PR number; its body is the plan
//   issue      an issue number; its body is the plan
//   reviewers  restrict the roster to these agent names

const SEVERITIES = ['blocker', 'major', 'minor', 'note']
const RANK = { blocker: 0, major: 1, minor: 2, note: 3 }
const LINE_FUZZ = 3 // findings on the same file within this many lines are one finding
const VERIFY_CAP = 12 // skeptics per run; the rest are reported unverified, never dropped

// The plan-stage roster. Names resolve as shopify-app-kit:<name> (agents/<name>.md).
const ROSTER = [
  { name: 'design-review-architecture' },
  { name: 'design-review-feasibility' },
  { name: 'design-review-product-intent' },
  { name: 'design-review-risk-governance' },
]

const opts = (() => {
  if (typeof args === 'number') return { pr: String(args) }
  if (typeof args === 'string') {
    const s = args.trim()
    if (/^#\d+$/.test(s)) return { issue: s.slice(1) }
    if (/^\d+$/.test(s)) return { pr: s }
    return s ? { plan: s } : {}
  }
  return args && typeof args === 'object' ? args : {}
})()

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    planFound: { type: 'boolean' },
    source: { type: 'string' },
    plan: { type: 'string' },
    summary: { type: 'string' },
    sections: { type: 'array', items: { type: 'string' } },
    request: { type: 'string' },
    manifestFound: { type: 'boolean' },
    manifestFacts: { type: 'string' },
    adrDir: { type: 'string' },
    adrs: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['planFound', 'source', 'plan', 'summary', 'sections', 'request', 'manifestFound', 'manifestFacts', 'adrDir', 'adrs', 'notes'],
}

// The same finding shape as pre-pr-review, plus the optional adr tag; on a plan the evidence is a section, so
// file is "" and line is 0 unless the reviewer read something in the checkout.
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
          adr: { type: 'boolean' },
        },
        required: ['severity', 'claim', 'file', 'line', 'section', 'evidence', 'fix'],
      },
    },
    checked: { type: 'string' },
  },
  required: ['headline', 'findings', 'checked'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
    severity: { type: 'string', enum: SEVERITIES },
  },
  required: ['refuted', 'reason', 'severity'],
}

// ---------------------------------------------------------------------------------------------------------
phase('Scope')

const scope = await agent(`You are the read-only scoping pass for a plan review in the current checkout. Do not modify any file; do not
create branches, stashes or worktrees. Gather the facts below with the file system, jq and (when installed) gh, and
return them in the structured shape requested.

1. The plan: ${opts.plan ? `read the file \`${opts.plan}\` (source "plan file ${opts.plan}")` : opts.pr ? `the body of PR #${opts.pr} (\`gh pr view ${opts.pr} --json body,title,number\`; source "PR #${opts.pr} body")` : opts.issue ? `the body of issue #${opts.issue} (\`gh issue view ${opts.issue} --json body,title,number\`; source "issue #${opts.issue}")` : 'the plan file this branch adds or changes (a markdown file whose path or name contains "plan", or under docs/plans/ or plans/), else the body of the open PR for this branch, else planFound false'}.
   Return the plan text verbatim in plan (truncate to about 12000 characters and say so in notes), a five-line
   summary in summary, and its markdown headings in order in sections.
2. request: the raw initiating request when the plan cites one (an issue it links, a "Request" or "Problem" section,
   the PR's linked issue); else "".
3. Manifest: read \`.claude/shopify-app.json\` if it exists (manifestFound). In manifestFacts, list as one line each the
   manifest sections the plan touches, with their values: branches, paths (server, prisma, extensions), apiVersion,
   webhooks, scopes, deploy (targets, protectedWorkflows, scaleToZeroBeforeMigrate), billing (live, method),
   auth.expiringOfflineTokens, database (provider, rls, sharedDevDbWithBeta), docs.adrDir. Say which sections the plan
   never mentions but should.
4. adrDir: \`docs.adrDir\` when set and the directory exists, else ""; adrs: the file names under it.
5. notes: anything a reviewer should know (no manifest, gh missing, no plan found, truncation).`,
  { label: 'scope', phase: 'Scope', effort: 'low', schema: SCOPE_SCHEMA })

if (!scope) throw new Error('scoping pass returned nothing; cannot find the plan')
if (!scope.planFound || !scope.plan) {
  log('no plan found; pass a plan file path, a PR number or "#<issue>"')
  return { verdict: 'rethink', source: scope.source, findings: [], refuted: [], adrs: [], reviewers: [], skipped: [], failed: [],
    notes: `${scope.notes ? `${scope.notes}; ` : ''}no plan to review` }
}
log(`plan from ${scope.source}: ${scope.sections.length} sections; manifest ${scope.manifestFound ? 'present' : 'absent'}; ADRs ${scope.adrDir ? `under ${scope.adrDir} (${scope.adrs.length})` : 'none'}`)

// ---------------------------------------------------------------------------------------------------------
// Pick the roster.
const wanted = Array.isArray(opts.reviewers) && opts.reviewers.length ? new Set(opts.reviewers) : null
const skipped = []
const selected = ROSTER.filter((r) => {
  if (wanted && !wanted.has(r.name)) { skipped.push({ name: r.name, reason: 'not in args.reviewers' }); return false }
  return true
})
for (const s of skipped) log(`skipping ${s.name}: ${s.reason}`)

const indent = (s) => String(s || '').split('\n').map((l) => `  ${l}`).join('\n')
const context = `Review this plan before anything is built. A scoping pass gathered the context below; treat it as a starting
point and verify it yourself from the checkout.

- plan source: ${scope.source}
- manifest: ${scope.manifestFound ? '.claude/shopify-app.json is present; read it first' : 'none found; run in generic mode and say so'}
- manifest facts the plan touches:
${indent(scope.manifestFacts || '(none listed)')}
- ADRs: ${scope.adrDir ? `${scope.adrDir}/ holds ${scope.adrs.length} record(s): ${scope.adrs.join(', ')}` : 'no ADR directory (docs.adrDir unset)'}
- raw initiating request:
${indent(scope.request || '(none cited: say so, and judge the plan against its own stated goal)')}
- the plan (sections: ${scope.sections.join(' | ') || 'none'}):
${indent(scope.plan)}
${scope.notes ? `- notes: ${scope.notes}` : ''}

Do the review exactly as your own instructions say: read the plan as written, the manifest and any ADR it cites,
run only read-only tooling, and never modify a file. Then return the structured shape requested: your headline,
one entry per finding (severity blocker|major|minor|note, a one-line claim, the plan section it points at in
section (or "whole plan"), file "" and line 0 unless the evidence is a file in the checkout, the evidence you read,
and a proposed fix), and one paragraph on what you read and what you tried to break. Set adr: true on a finding
whose fix is a decision the plan should record as an ADR (significant, constraining, hard to reverse, with a real
rejected alternative). An empty findings list still needs the headline and the checked paragraph.`

// ---------------------------------------------------------------------------------------------------------
// Review: a barrier is right here, because dedupe below needs every reviewer's findings at once.
phase('Review')
const reports = await parallel(selected.map((r) => () =>
  agent(context, { agentType: `shopify-app-kit:${r.name}`, label: r.name, phase: 'Review', schema: FINDINGS_SCHEMA })
    .then((out) => ({ name: r.name, out }))))

const ran = []
const failed = []
const raw = []
for (let i = 0; i < selected.length; i++) {
  const rep = reports[i]
  if (!rep || !rep.out) { failed.push(selected[i].name); continue }
  ran.push({ name: rep.name, headline: rep.out.headline, checked: rep.out.checked, count: rep.out.findings.length })
  for (const f of rep.out.findings) raw.push({ ...f, adr: f.adr === true, reviewer: rep.name })
}
for (const f of failed) log(`reviewer ${f} returned nothing (skipped or failed); its lens is uncovered and the verdict cannot be sound`)
log(`${raw.length} raw findings from ${ran.length} reviewers`)

// ---------------------------------------------------------------------------------------------------------
// Dedupe in plain code: same file within LINE_FUZZ lines, or the same normalised section when there is no file
// (two reviewers on one section are one finding carrying both claims and the higher severity).
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80)
const sorted = raw.slice().sort((a, b) => (a.file || '~').localeCompare(b.file || '~') || norm(a.section || a.claim).localeCompare(norm(b.section || b.claim)) || (a.line || 0) - (b.line || 0))
const merged = []
for (const f of sorted) {
  const prev = merged[merged.length - 1]
  const sameSpot = prev && f.file && prev.file === f.file && Math.abs((f.line || 0) - (prev.line || 0)) <= LINE_FUZZ
  const sameTopic = prev && !f.file && !prev.file && norm(f.section || f.claim) === norm(prev.section || prev.claim)
  if (sameSpot || sameTopic) {
    if (RANK[f.severity] < RANK[prev.severity]) { prev.severity = f.severity; prev.claim = f.claim; prev.fix = f.fix }
    if (f.adr) prev.adr = true
    if (!prev.reviewers.includes(f.reviewer)) prev.reviewers.push(f.reviewer)
    if (!prev.claims.includes(f.claim)) prev.claims.push(f.claim)
    if (f.evidence && !prev.evidence.includes(f.evidence)) prev.evidence = `${prev.evidence}\n${f.evidence}`
    continue
  }
  merged.push({ severity: f.severity, claim: f.claim, file: f.file, line: f.line, section: f.section, evidence: f.evidence,
    fix: f.fix, adr: f.adr, reviewers: [f.reviewer], claims: [f.claim] })
}
log(`${merged.length} findings after dedupe`)

// ---------------------------------------------------------------------------------------------------------
// Verify: one skeptic per blocker or major, capped; a refuted finding is kept as a note with the reason.
phase('Verify')
const serious = merged.filter((f) => f.severity === 'blocker' || f.severity === 'major')
const toVerify = serious.slice(0, VERIFY_CAP)
if (serious.length > VERIFY_CAP) log(`verifying ${VERIFY_CAP} of ${serious.length} serious findings; the rest are reported unverified`)

const verdicts = await parallel(toVerify.map((f, i) => () =>
  agent(`Try to refute this plan-review finding (plan source: ${scope.source}). You are read-only: read the plan, the manifest
and the cited files, run only tooling that writes nothing, never modify a file, never create a branch, stash or worktree.

Finding [${f.severity}] ${f.file ? `${f.file}:${f.line}` : f.section} — ${f.claim}
Raised by: ${f.reviewers.join(', ')}
Evidence: ${f.evidence}
Proposed fix: ${f.fix}

The plan:
${indent(scope.plan.slice(0, 8000))}

Return refuted=true only when you can show, with evidence from the plan, the manifest or the checkout, that the
claim is wrong, already addressed by the plan, or outside its scope. Return refuted=false when it stands, even
partly. Either way give the reason and the severity you would assign (blocker | major | minor | note).`,
    { label: `verify:${norm(f.section || 'whole plan').replace(/ /g, '-').slice(0, 30)}#${i + 1}`, phase: 'Verify', schema: VERDICT_SCHEMA })))

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

// ---------------------------------------------------------------------------------------------------------
// Verdict: rethink on a surviving blocker, revise on a major or an uncovered lens, else sound.
merged.sort((a, b) => RANK[a.severity] - RANK[b.severity] || norm(a.section).localeCompare(norm(b.section)) || (a.line || 0) - (b.line || 0))
const counts = { blocker: 0, major: 0, minor: 0, note: 0 }
for (const f of merged) counts[f.severity]++
const verdict = counts.blocker > 0 ? 'rethink' : (counts.major > 0 || failed.length > 0) ? 'revise' : 'sound'
const adrs = merged.filter((f) => f.adr).map((f) => ({ section: f.section, decision: f.fix, claim: f.claim, reviewers: f.reviewers }))
log(`verdict: ${verdict} (${counts.blocker} blocker, ${counts.major} major, ${counts.minor} minor, ${counts.note} note; ${refuted.length} refuted; ${failed.length} failed; ${adrs.length} ADR decision(s))`)

return {
  verdict,
  source: scope.source,
  summary: scope.summary,
  adrDir: scope.adrDir,
  counts,
  findings: merged,
  refuted,
  adrs,
  reviewers: ran,
  skipped,
  failed,
  notes: scope.notes,
}

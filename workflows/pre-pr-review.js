export const meta = {
  name: 'pre-pr-review',
  description: 'Run the diff-stage review roster on the current branch in one go and dedupe the findings into one verdict',
  whenToUse: 'Use when a branch is about to become a pull request, or a PR is about to be merged or promoted, and you want every diff-stage reviewer (qa-review-*, prisma-migration-reviewer, storefront-extension-reviewer) run once with the findings merged, verified and ranked. Not for plans: launch the design-review-* agents on a plan instead.',
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
// args (all optional): a base-branch string, or { base, pr, reviewers, all }
//   base       review against this branch instead of the manifest's choice
//   pr         a PR number; its base and body are used
//   reviewers  restrict the roster to these agent names
//   all        true forces the stack reviewers to run even when the diff does not touch their files

const SEVERITIES = ['blocker', 'major', 'minor', 'note']
const RANK = { blocker: 0, major: 1, minor: 2, note: 3 }
const LINE_FUZZ = 3 // findings on the same file within this many lines are one finding
const VERIFY_CAP = 12 // skeptics per run; the rest are reported unverified, never dropped

// The roster and when each reviewer runs. Names resolve as shopify-app-kit:<name> (agents/<name>.md).
const ROSTER = [
  { name: 'qa-review-security-governance', when: 'always' },
  { name: 'qa-review-spec-conformance', when: 'always' },
  { name: 'qa-review-technical-integrity', when: 'always' },
  { name: 'qa-review-usability', when: 'always' },
  { name: 'qa-review-divergence-hunter', when: 'always' },
  { name: 'prisma-migration-reviewer', when: 'prisma' },
  { name: 'storefront-extension-reviewer', when: 'extensions' },
]

const opts = typeof args === 'string' ? { base: args } : (args && typeof args === 'object' ? args : {})

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    manifestFound: { type: 'boolean' },
    base: { type: 'string' },
    baseRef: { type: 'string' },
    head: { type: 'string' },
    pr: { type: 'string' },
    changedFiles: { type: 'array', items: { type: 'string' } },
    diffStat: { type: 'string' },
    intentSource: { type: 'string' },
    intent: { type: 'string' },
    touchesPrisma: { type: 'boolean' },
    extensionsDeclared: { type: 'boolean' },
    touchesExtensions: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['manifestFound', 'base', 'baseRef', 'head', 'pr', 'changedFiles', 'diffStat', 'intentSource', 'intent',
    'touchesPrisma', 'extensionsDeclared', 'touchesExtensions', 'notes'],
}

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

const scope = await agent(`You are the read-only scoping pass for a pre-PR review of the current checkout. Do not modify any file; do not
create branches, stashes or worktrees. Gather the facts below with git, jq and (when installed) gh, and return them
in the structured shape requested.

1. Manifest: read \`.claude/shopify-app.json\` if it exists (manifestFound). Note \`branches.default\`,
   \`branches.promotion\`, \`paths.prisma\` and \`paths.extensions\`.
2. Base branch, in this order: ${opts.base ? `the operator asked for "${opts.base}";` : ''} ${opts.pr ? `PR #${opts.pr}'s base (\`gh pr view ${opts.pr} --json baseRefName,body,number\`);` : ''}
   \`branches.promotion.to\` when the current branch equals \`branches.promotion.from\`; else \`branches.default\`;
   else \`main\`. Report the name as \`base\` and the ref you diffed against as \`baseRef\` (\`origin/<base>\` after
   \`git fetch origin <base>\` succeeds, else the local \`<base>\`).
3. Head: \`git rev-parse --abbrev-ref HEAD\`. Diff: \`git diff <baseRef>...HEAD --stat\` (diffStat) and
   \`git diff <baseRef>...HEAD --name-only\` (changedFiles, repo-relative).
4. PR: ${opts.pr ? `"${opts.pr}"` : 'the number of the open PR for this head branch (`gh pr view --json number,body` when gh is installed and authenticated), else ""'}.
5. Intent: the PR body when a PR exists (intentSource "PR #<n> body"); else the contents of a plan file this branch
   adds or changes (a markdown file whose path or name contains "plan", or under docs/plans/ or plans/;
   intentSource "plan file <path>"); else intentSource "none" and intent "". Truncate intent to about 6000
   characters and say so in notes if you did.
6. touchesPrisma: any changed file under \`paths.prisma\`, or named schema.prisma, or under a migrations/
   directory. extensionsDeclared: \`paths.extensions\` is a non-empty array. touchesExtensions: any changed file
   under one of the \`paths.extensions\` directories.
7. notes: anything a reviewer should know (no manifest, gh missing, base ref missing, diff empty).`,
  { label: 'scope', phase: 'Scope', effort: 'low', schema: SCOPE_SCHEMA })

if (!scope) throw new Error('scoping pass returned nothing; cannot choose a base or a roster')
if (scope.changedFiles.length === 0) {
  log(`no changes between ${scope.baseRef} and ${scope.head}; nothing to review`)
  return { verdict: 'approve', base: scope.base, head: scope.head, pr: scope.pr, findings: [], reviewers: [], skipped: [], notes: scope.notes }
}
log(`${scope.head} vs ${scope.baseRef}: ${scope.changedFiles.length} files; intent from ${scope.intentSource}`)

// ---------------------------------------------------------------------------------------------------------
// Pick the roster.
const wanted = Array.isArray(opts.reviewers) && opts.reviewers.length ? new Set(opts.reviewers) : null
const skipped = []
const selected = ROSTER.filter((r) => {
  if (wanted && !wanted.has(r.name)) { skipped.push({ name: r.name, reason: 'not in args.reviewers' }); return false }
  if (opts.all || r.when === 'always') return true
  if (r.when === 'prisma' && !scope.touchesPrisma) { skipped.push({ name: r.name, reason: 'no Prisma schema or migration in the diff' }); return false }
  if (r.when === 'extensions' && !scope.extensionsDeclared) { skipped.push({ name: r.name, reason: 'paths.extensions is empty or absent' }); return false }
  if (r.when === 'extensions' && !scope.touchesExtensions) { skipped.push({ name: r.name, reason: 'no extension file in the diff' }); return false }
  return true
})
for (const s of skipped) log(`skipping ${s.name}: ${s.reason}`)

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

Do the review exactly as your own instructions say: read the diff and the changed files in full from the checkout,
run only read-only tooling against it, and never modify a file. Then return the structured shape requested: your
headline, one entry per finding (severity blocker|major|minor|note, a one-line claim, file and line when the
evidence is in the checkout, otherwise file "" and line 0 with the plan section or "whole change" in section,
the evidence you read or ran, and a proposed fix), and one paragraph on what you checked and where you ran things.
An empty findings list still needs the headline and the checked paragraph.`

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
  for (const f of rep.out.findings) raw.push({ ...f, reviewer: rep.name })
}
for (const f of failed) log(`reviewer ${f} returned nothing (skipped or failed); its lens is uncovered`)
log(`${raw.length} raw findings from ${ran.length} reviewers`)

// ---------------------------------------------------------------------------------------------------------
// Dedupe in plain code: same file within LINE_FUZZ lines, or the same normalised section/claim when no file.
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 80)
const sorted = raw.slice().sort((a, b) => (a.file || '~').localeCompare(b.file || '~') || (a.line || 0) - (b.line || 0))
const merged = []
for (const f of sorted) {
  const prev = merged[merged.length - 1]
  const sameSpot = prev && f.file && prev.file === f.file && Math.abs((f.line || 0) - (prev.line || 0)) <= LINE_FUZZ
  const sameTopic = prev && !f.file && !prev.file && norm(f.section || f.claim) === norm(prev.section || prev.claim)
  if (sameSpot || sameTopic) {
    if (RANK[f.severity] < RANK[prev.severity]) { prev.severity = f.severity; prev.claim = f.claim; prev.fix = f.fix }
    if (!prev.reviewers.includes(f.reviewer)) prev.reviewers.push(f.reviewer)
    if (!prev.claims.includes(f.claim)) prev.claims.push(f.claim)
    if (f.evidence && !prev.evidence.includes(f.evidence)) prev.evidence = `${prev.evidence}\n${f.evidence}`
    continue
  }
  merged.push({ severity: f.severity, claim: f.claim, file: f.file, line: f.line, section: f.section, evidence: f.evidence,
    fix: f.fix, reviewers: [f.reviewer], claims: [f.claim] })
}
log(`${merged.length} findings after dedupe`)

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

Finding [${f.severity}] ${f.file ? `${f.file}:${f.line}` : f.section} — ${f.claim}
Raised by: ${f.reviewers.join(', ')}
Evidence: ${f.evidence}
Proposed fix: ${f.fix}

Return refuted=true only when you can show, with evidence from the checkout, that the claim is wrong, already
handled, or out of this branch's scope (pre-existing and untouched). Return refuted=false when it stands, even
partly. Either way give the reason and the severity you would assign (blocker | major | minor | note).`,
    { label: `verify:${f.file ? f.file.split('/').pop() : 'whole'}#${i + 1}`, phase: 'Verify', schema: VERDICT_SCHEMA })))

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
// Verdict on the review skill's scale.
merged.sort((a, b) => RANK[a.severity] - RANK[b.severity] || (a.file || '~').localeCompare(b.file || '~') || (a.line || 0) - (b.line || 0))
const counts = { blocker: 0, major: 0, minor: 0, note: 0 }
for (const f of merged) counts[f.severity]++
const verdict = counts.blocker > 0 ? 'block' : counts.major > 0 ? 'changes-needed' : 'approve'
log(`verdict: ${verdict} (${counts.blocker} blocker, ${counts.major} major, ${counts.minor} minor, ${counts.note} note; ${refuted.length} refuted)`)

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
  notes: scope.notes,
}

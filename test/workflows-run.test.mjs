// Runs workflows/pre-pr-review.js, workflows/release-readiness.js and workflows/plan-review.js under a stub of
// the Workflow runtime (agent/parallel/phase/log/args) with canned reviewer output, so each script's own logic is
// tested offline: roster or dimension selection from the scope, dedupe of findings on the same spot or section,
// a refuted finding demoted to a note, a reviewer that returns nothing recorded as failed, and the verdict.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = Object.fromEntries(['pre-pr-review', 'release-readiness', 'plan-review']
  .map((n) => [n, fs.readFileSync(path.resolve(here, '..', 'workflows', `${n}.js`), 'utf8')]));
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// The runtime wraps the body in an async function (top-level `return` is allowed); mirror that.
function load(name = 'pre-pr-review') {
  return new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', scripts[name].replace(/^export const meta/, 'const meta'));
}

// reviews is keyed by agent name (pre-pr-review, plan-review) or by the launch label (release-readiness, whose
// dimensions share an agent); reviewPhase is the phase every agentType launch must carry.
function runtime({ scope, reviews, verdicts, reviewPhase = 'Review', byLabel = false }) {
  const calls = [];
  const logs = [];
  const phases = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ prompt, opts });
    if (opts.label === 'scope') return scope;
    if (opts.agentType) {
      const key = byLabel ? opts.label : opts.agentType.replace('shopify-app-kit:', '');
      assert.equal(opts.phase, reviewPhase);
      return key in reviews ? reviews[key] : { headline: 'nothing found', findings: [], checked: 'read the diff' };
    }
    if (opts.label?.startsWith('verify:')) {
      const m = prompt.match(/Finding \[\w+\] (.*?) — (.*)/);
      return verdicts[m[2]] ?? { refuted: false, reason: 'stands', severity: 'major' };
    }
    throw new Error(`unexpected agent call ${JSON.stringify(opts)}`);
  };
  const parallel = (thunks) => Promise.all(thunks.map((t) => Promise.resolve().then(t).catch(() => null)));
  const pipeline = () => { throw new Error('not used'); };
  return { calls, logs, phases, agent, parallel, pipeline, phase: (t) => phases.push(t), log: (m) => logs.push(m), budget: { total: null, spent: () => 0, remaining: () => Infinity } };
}
const run = (name, rt, args) => load(name)(rt.agent, rt.parallel, rt.pipeline, rt.phase, rt.log, args, rt.budget);

const baseScope = {
  manifestFound: true, base: 'beta', baseRef: 'origin/beta', head: 'feature/x', pr: '12',
  changedFiles: ['web/app/routes/app.tsx', 'web/prisma/schema.prisma', 'web/prisma/migrations/1_x/migration.sql'],
  diffStat: ' 3 files changed', intentSource: 'PR #12 body', intent: 'Add a widget.',
  touchesPrisma: true, extensionsDeclared: false, touchesExtensions: false, notes: '',
};

const finding = (severity, claim, file, line, extra = {}) => ({ severity, claim, file, line, section: file ? '' : 'whole change', evidence: `read ${file || 'the plan'}`, fix: `fix ${claim}`, ...extra });

describe('pre-pr-review under a stub runtime', () => {
  test('selects the roster from the scope, dedupes, verifies, and returns block on a confirmed blocker', async () => {
    const rt = runtime({
      scope: baseScope,
      reviews: {
        'qa-review-security-governance': { headline: 'not safe', checked: 'read it', findings: [finding('blocker', 'route has no authenticator', 'web/app/routes/app.tsx', 12)] },
        'qa-review-technical-integrity': { headline: 'ok-ish', checked: 'ran tests here', findings: [finding('minor', 'same route, loader too fat', 'web/app/routes/app.tsx', 14), finding('major', 'no test for the widget', '', 0)] },
        'qa-review-divergence-hunter': { headline: 'one', checked: 'read', findings: [finding('major', 'no test for the widget', '', 0)] },
        'prisma-migration-reviewer': { headline: 'destructive', checked: 'read SQL', findings: [finding('major', 'drop column not acknowledged', 'web/prisma/migrations/1_x/migration.sql', 3)] },
      },
      verdicts: {
        'route has no authenticator': { refuted: false, reason: 'confirmed: loader reads shop data before authenticate.admin', severity: 'blocker' },
        'drop column not acknowledged': { refuted: true, reason: 'the PR body names the column and the backfill', severity: 'note' },
      },
    });
    const result = await load()(rt.agent, rt.parallel, rt.pipeline, rt.phase, rt.log, undefined, rt.budget);

    assert.deepEqual(rt.phases, ['Scope', 'Review', 'Verify']);
    const launched = rt.calls.filter((c) => c.opts.agentType).map((c) => c.opts.agentType).sort();
    assert.deepEqual(launched, [
      'shopify-app-kit:prisma-migration-reviewer',
      'shopify-app-kit:qa-review-divergence-hunter', 'shopify-app-kit:qa-review-security-governance', 'shopify-app-kit:qa-review-spec-conformance',
      'shopify-app-kit:qa-review-technical-integrity', 'shopify-app-kit:qa-review-usability',
    ]);
    assert.deepEqual(result.skipped, [{ name: 'storefront-extension-reviewer', reason: 'paths.extensions is empty or absent' }]);
    assert.deepEqual(result.failed, []);

    // 5 raw findings → 3 after dedupe: the two on app.tsx within 3 lines merge (blocker wins), the two "no test" merge.
    assert.equal(result.findings.length, 3);
    const route = result.findings.find((f) => f.file === 'web/app/routes/app.tsx');
    assert.equal(route.severity, 'blocker');
    assert.deepEqual(route.reviewers.sort(), ['qa-review-security-governance', 'qa-review-technical-integrity']);
    assert.equal(route.claims.length, 2);
    const noTest = result.findings.find((f) => !f.file);
    assert.equal(noTest.severity, 'major');
    assert.deepEqual(noTest.reviewers.sort(), ['qa-review-divergence-hunter', 'qa-review-technical-integrity']);

    // The refuted major is kept, demoted to a note, and listed under refuted with the reason.
    const drop = result.findings.find((f) => f.file?.endsWith('migration.sql'));
    assert.equal(drop.severity, 'note');
    assert.match(drop.verification, /^refuted: the PR body/);
    assert.equal(result.refuted.length, 1);
    assert.match(route.verification, /^confirmed/);

    assert.equal(rt.calls.filter((c) => c.opts.label?.startsWith('verify:')).length, 3, 'one skeptic per blocker/major');
    assert.equal(result.verdict, 'block');
    assert.deepEqual(result.counts, { blocker: 1, major: 1, minor: 0, note: 1 });
    assert.equal(result.findings[0].severity, 'blocker', 'sorted by severity');
  });

  test('changes-needed on a surviving major, approve with none, and a dead reviewer is recorded as failed', async () => {
    const rt = runtime({
      scope: { ...baseScope, touchesPrisma: false },
      reviews: {
        'qa-review-usability': null,
        'qa-review-spec-conformance': { headline: 'partial', checked: 'read', findings: [finding('major', 'requirement 2 half-done', 'web/app/routes/app.tsx', 40)] },
      },
      verdicts: {},
    });
    const result = await load()(rt.agent, rt.parallel, rt.pipeline, rt.phase, rt.log, 'beta', rt.budget);
    assert.equal(result.verdict, 'changes-needed');
    assert.deepEqual(result.failed, ['qa-review-usability']);
    assert.ok(result.skipped.some((s) => s.name === 'prisma-migration-reviewer'));
    assert.ok(rt.calls[0].prompt.includes('the operator asked for "beta"'), 'a string arg is the base branch');

    const quiet = runtime({ scope: { ...baseScope, touchesPrisma: false }, reviews: {}, verdicts: {} });
    const ok = await load()(quiet.agent, quiet.parallel, quiet.pipeline, quiet.phase, quiet.log, { all: true }, quiet.budget);
    assert.equal(ok.verdict, 'approve');
    assert.equal(ok.findings.length, 0);
    assert.equal(quiet.calls.filter((c) => c.opts.agentType).length, 7, 'args.all runs the whole roster');
    assert.equal(quiet.calls.filter((c) => c.opts.label?.startsWith('verify:')).length, 0);
  });

  test('an empty diff returns approve without launching a reviewer', async () => {
    const rt = runtime({ scope: { ...baseScope, changedFiles: [] }, reviews: {}, verdicts: {} });
    const result = await load()(rt.agent, rt.parallel, rt.pipeline, rt.phase, rt.log, { reviewers: ['qa-review-usability'] }, rt.budget);
    assert.equal(result.verdict, 'approve');
    assert.equal(rt.calls.length, 1);
  });
});

// ---------------------------------------------------------------------------------------------- release-readiness
// The scope of a promotion range on a manifest like the npm-root fixture: pins, tomls, webhooks, live billing,
// one extension, a migration in the range, scale-to-zero on. Dimensions are keyed by their launch label.
const releaseScope = {
  manifestFound: true, from: 'beta', to: 'main', headRef: 'origin/beta', baseRef: 'origin/main', pr: '30',
  prBody: 'Promote beta. Drops the legacy column (acknowledged).',
  changedFiles: ['web/app/routes/app.tsx', 'web/prisma/schema.prisma', 'web/prisma/migrations/2_drop/migration.sql', 'shopify.app.example.toml', 'extensions/example/blocks/widget.liquid'],
  migrations: ['web/prisma/migrations/2_drop/migration.sql'], prismaPath: 'web/prisma', touchesPrisma: true,
  apiVersionExpected: '2026-07', pinFiles: ['web/app/shopify.server.ts', 'shopify.app.example.toml'], tomls: ['shopify.app.example.toml', 'shopify.app.example-dev.toml'],
  webhookTopics: ['app/uninstalled', 'app/scopes_update'], webhooksCompliance: true, webhookHandlers: 'web/app/routes',
  extensions: ['extensions/example'], extensionFiles: ['extensions/example/blocks/widget.liquid'],
  workflowFiles: [], protectedWorkflows: ['deploy.yml'], deployTargets: 'prod: deploy.yml', scaleToZeroBeforeMigrate: true,
  billingLive: true, billingMethod: 'billing-api', billingTestFlag: 'BILLING_TEST', appPublic: false, prodHandle: 'example-app', notes: '',
};
const dimFinding = (severity, claim, dimension, file = '', line = 0, extra = {}) => ({ severity, claim, file, line, section: file ? '' : dimension, evidence: `checked ${dimension}`, fix: `fix ${claim}`, ...extra });
const launchedLabels = (rt) => rt.calls.filter((c) => c.opts.agentType).map((c) => `${c.opts.label}=${c.opts.agentType.replace('shopify-app-kit:', '')}`).sort();

describe('release-readiness under a stub runtime', () => {
  test('selects every dimension the manifest enables, verifies, and returns no-go on a confirmed blocker', async () => {
    const rt = runtime({
      scope: releaseScope, reviewPhase: 'Dimensions', byLabel: true,
      reviews: {
        'api-version': { headline: 'pins drift', checked: 'read the pins', findings: [dimFinding('blocker', 'toml pins 2026-04 while apiVersion.expected is 2026-07', 'api-version', 'shopify.app.example.toml', 3)] },
        webhooks: { headline: 'ok', checked: 'read the tomls and routes', findings: [] },
        migrations: { headline: 'destructive', checked: 'read SQL', findings: [dimFinding('major', 'drop column not acknowledged', 'migrations', 'web/prisma/migrations/2_drop/migration.sql', 2), dimFinding('note', 'scale to zero before this migration', 'migrations')] },
        'branch-model': { headline: 'clean', checked: 'git log', findings: [] },
        billing: { headline: 'no plan change', checked: 'grep plans', findings: [] },
        extension: { headline: 'compatible', checked: 'read the schema', findings: [dimFinding('note', 'verify example-app-<N> in an asset URL after deploy', 'extension')] },
      },
      verdicts: {
        'toml pins 2026-04 while apiVersion.expected is 2026-07': { refuted: false, reason: 'the toml really says 2026-04', severity: 'blocker' },
        'drop column not acknowledged': { refuted: true, reason: 'the PR body acknowledges the drop', severity: 'note' },
      },
    });
    const result = await run('release-readiness', rt, undefined);

    assert.deepEqual(rt.phases, ['Scope', 'Dimensions', 'Verify']);
    assert.deepEqual(launchedLabels(rt), [
      'api-version=review-correctness', 'billing=review-correctness', 'branch-model=qa-review-security-governance',
      'extension=storefront-extension-reviewer', 'migrations=prisma-migration-reviewer', 'webhooks=review-correctness',
    ]);
    assert.deepEqual(result.skipped, [{ dimension: 'app-store-review', reason: 'not a public app (billing.method is not app-pricing)' }]);
    assert.deepEqual(result.failed, []);
    assert.equal(rt.calls.filter((c) => c.opts.label?.startsWith('verify:')).length, 2, 'one skeptic per blocker/major');

    assert.equal(result.verdict, 'no-go');
    assert.equal(result.findings[0].severity, 'blocker');
    assert.deepEqual(result.findings[0].dimensions, ['api-version']);
    assert.match(result.findings[0].verification, /^confirmed/);
    const drop = result.findings.find((f) => f.file?.endsWith('migration.sql'));
    assert.equal(drop.severity, 'note');
    assert.match(drop.verification, /^refuted: the PR body/);
    assert.equal(result.refuted.length, 1);
    assert.deepEqual(result.counts, { blocker: 1, major: 0, minor: 0, note: 3 });

    // The checklist: the release skill's step 7 lines plus one per dimension, pre-ticked where the dimension passed.
    const lines = result.checklist.split('\n');
    assert.match(lines[0], /^release-readiness: no-go \(1 blocker, 0 major, 0 minor, 3 note\)$/);
    assert.ok(lines.includes('- [ ] CI green on beta; migrate diff clean; tripwires green'));
    assert.ok(lines.includes('- [ ] API version pins agree on 2026-07'), 'api-version raised a blocker: unticked');
    assert.ok(lines.includes('- [x] Webhook topics subscribed and handled; compliance handlers present'));
    assert.ok(lines.includes('- [x] Branch model: range is beta -> main; protected workflows untouched or reviewed'));
    assert.ok(lines.includes('- [x] App Store review check: not applicable (billing.method billing-api, not a public app)'));
    assert.ok(lines.includes('- [x] Migration in this release: 1 file(s); scale to zero first (scaleToZeroBeforeMigrate): yes'), 'the refuted major became a note, so migrations passed');
    assert.ok(lines.includes('- [ ] Extension version to release: example-app-<N>; verified in an asset URL after deploy (settings compatibility checked)'));
    assert.ok(lines.includes('- [ ] Server target(s): prod: deploy.yml'));
    assert.ok(lines.includes('- [x] Billing live: no plan or price change in this release / change reviewed'));
    assert.ok(lines.includes('- [ ] app dev clean run on the dev registration'));
    assert.ok(rt.calls[0].prompt.includes('`branches.promotion.from`'), 'the range comes from the manifest by default');
  });

  test('skips billing, extension, migrations and webhooks when the manifest or the range does not enable them; a refuted blocker gives go-with-notes', async () => {
    const rt = runtime({
      scope: { ...releaseScope, billingLive: false, extensions: [], extensionFiles: [], touchesPrisma: false, migrations: [], webhookTopics: [], webhooksCompliance: false, billingMethod: 'none', scaleToZeroBeforeMigrate: false },
      reviewPhase: 'Dimensions', byLabel: true,
      reviews: { 'branch-model': { headline: 'stray commit', checked: 'git log', findings: [dimFinding('blocker', 'a commit sits on main outside the merge', 'branch-model')] } },
      verdicts: { 'a commit sits on main outside the merge': { refuted: true, reason: 'it is the previous promotion merge itself', severity: 'note' } },
    });
    const result = await run('release-readiness', rt, { base: 'main', head: 'beta' });
    assert.deepEqual(launchedLabels(rt), ['api-version=review-correctness', 'branch-model=qa-review-security-governance']);
    assert.deepEqual(result.skipped.map((s) => s.dimension).sort(), ['app-store-review', 'billing', 'extension', 'migrations', 'webhooks']);
    assert.equal(result.verdict, 'go-with-notes');
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0].severity, 'note');
    assert.equal(result.refuted.length, 1);
    const lines = result.checklist.split('\n');
    assert.ok(lines.includes('- [x] Migration in this release: none'));
    assert.ok(lines.includes('- [x] Extension version to release: none (paths.extensions empty)'));
    assert.ok(lines.includes('- [x] Billing live: no (billing.live false)'));
    assert.ok(lines.includes('- [x] Webhook topics subscribed and handled; compliance handlers present (not applicable: no webhooks section)'), 'a dimension the manifest does not enable is ticked as not applicable');
    assert.ok(lines.includes('- [x] Branch model: range is beta -> main; protected workflows untouched or reviewed'), 'a refuted finding is a note, so the dimension still passed');
    assert.ok(rt.calls[0].prompt.includes('"beta" (the operator\'s choice)') && rt.calls[0].prompt.includes('"main" (the operator\'s choice)'), 'args.base and args.head override the range');
  });

  test('a public app gets the app-store-review note without launching an agent, and a clean run is go', async () => {
    const rt = runtime({ scope: { ...releaseScope, billingLive: false, billingMethod: 'app-pricing', touchesPrisma: false, migrations: [] }, reviewPhase: 'Dimensions', byLabel: true, reviews: {}, verdicts: {} });
    const result = await run('release-readiness', rt, undefined);
    assert.deepEqual(launchedLabels(rt), ['api-version=review-correctness', 'branch-model=qa-review-security-governance', 'extension=storefront-extension-reviewer', 'webhooks=review-correctness']);
    assert.ok(result.dimensions.some((d) => d.dimension === 'app-store-review' && d.status === 'note'));
    assert.equal(result.findings.length, 1);
    assert.match(result.findings[0].claim, /shopify-app-store-review/);
    assert.equal(result.findings[0].severity, 'note');
    assert.equal(result.verdict, 'go-with-notes', 'the App Store review note keeps the verdict off go');
    assert.ok(result.checklist.includes('- [ ] App Store review check (public app): summary attached / companion not installed'));

    const quiet = runtime({ scope: { ...releaseScope, billingLive: false, billingMethod: 'none', touchesPrisma: false, migrations: [], extensions: [], extensionFiles: [] }, reviewPhase: 'Dimensions', byLabel: true, reviews: {}, verdicts: {} });
    const ok = await run('release-readiness', quiet, undefined);
    assert.equal(ok.verdict, 'go');
    assert.equal(ok.findings.length, 0);
    assert.equal(quiet.calls.filter((c) => c.opts.label?.startsWith('verify:')).length, 0);
    assert.match(ok.checklist.split('\n')[0], /^release-readiness: go \(0 blocker/);
  });

  test('a dimension that returns nothing is recorded as failed and the verdict is never go', async () => {
    const rt = runtime({ scope: { ...releaseScope, billingLive: false, billingMethod: 'none', touchesPrisma: false, migrations: [], extensions: [], extensionFiles: [] }, reviewPhase: 'Dimensions', byLabel: true, reviews: { webhooks: null }, verdicts: {} });
    const result = await run('release-readiness', rt, { dimensions: ['api-version', 'webhooks', 'branch-model'] });
    assert.deepEqual(result.failed, ['webhooks']);
    assert.equal(result.findings.length, 0);
    assert.equal(result.verdict, 'go-with-notes');
    assert.match(result.checklist.split('\n')[0], /uncovered: webhooks/);
    assert.ok(result.checklist.includes('- [ ] Webhook topics subscribed and handled; compliance handlers present'), 'a failed dimension is never pre-ticked');
    assert.ok(result.dimensions.some((d) => d.dimension === 'webhooks' && d.status === 'failed'));
    assert.ok(rt.logs.some((l) => /webhooks returned nothing/.test(l)));
  });

  test('no manifest is no-go and an empty range is go, neither launching a dimension', async () => {
    const empty = Object.fromEntries(Object.entries(releaseScope).map(([k, v]) => [k, Array.isArray(v) ? [] : typeof v === 'boolean' ? false : typeof v === 'string' ? '' : v]));
    const none = runtime({ scope: { ...empty, notes: 'no manifest' }, reviewPhase: 'Dimensions', byLabel: true, reviews: {}, verdicts: {} });
    const r1 = await run('release-readiness', none, undefined);
    assert.equal(r1.verdict, 'no-go');
    assert.equal(none.calls.length, 1);
    assert.match(r1.checklist, /no manifest/);
    const quiet = runtime({ scope: { ...releaseScope, changedFiles: [] }, reviewPhase: 'Dimensions', byLabel: true, reviews: {}, verdicts: {} });
    const r2 = await run('release-readiness', quiet, undefined);
    assert.equal(r2.verdict, 'go');
    assert.equal(quiet.calls.length, 1);
  });
});

// ---------------------------------------------------------------------------------------------- plan-review
const planScope = {
  planFound: true, source: 'plan file docs/plans/widget.md',
  plan: '# Widget\n\n## Data model\nA Widget table.\n\n## Rollout\nShip behind a flag.\n', summary: 'Adds a widget.', sections: ['Widget', 'Data model', 'Rollout'],
  request: 'Merchants want a widget.', manifestFound: true, manifestFacts: 'database: supabase, rls true', adrDir: 'docs/adr', adrs: ['0001-scaffold.md'], notes: '',
};
const planFinding = (severity, claim, section, extra = {}) => ({ severity, claim, file: '', line: 0, section, evidence: `read §${section}`, fix: `fix ${claim}`, ...extra });
const launchedAgents = (rt) => rt.calls.filter((c) => c.opts.agentType).map((c) => c.opts.agentType.replace('shopify-app-kit:', '')).sort();

describe('plan-review under a stub runtime', () => {
  test('runs the four design reviewers, merges two reviewers on one section, verifies, collects ADR decisions, and returns rethink on a confirmed blocker', async () => {
    const rt = runtime({
      scope: planScope,
      reviews: {
        'design-review-architecture': { headline: 'no tenant column', checked: 'read the plan', findings: [planFinding('blocker', 'the Widget table has no tenant_id', 'Data model', { adr: false })] },
        'design-review-risk-governance': { headline: 'RLS', checked: 'read the plan and the manifest', findings: [planFinding('major', 'no RLS policy named for the Widget table', 'Data model'), planFinding('minor', 'flag has no owner', 'Rollout')] },
        'design-review-feasibility': { headline: 'migration order', checked: 'read the plan', findings: [planFinding('major', 'the backfill runs before the column exists', 'Rollout', { adr: true })] },
        'design-review-product-intent': { headline: 'fine', checked: 'read the request', findings: [] },
      },
      verdicts: {
        'the Widget table has no tenant_id': { refuted: false, reason: 'the plan names no tenant column', severity: 'blocker' },
        'the backfill runs before the column exists': { refuted: false, reason: 'the order in §Rollout is backfill then migrate', severity: 'major' },
      },
    });
    const result = await run('plan-review', rt, 'docs/plans/widget.md');

    assert.deepEqual(rt.phases, ['Scope', 'Review', 'Verify']);
    assert.deepEqual(launchedAgents(rt), ['design-review-architecture', 'design-review-feasibility', 'design-review-product-intent', 'design-review-risk-governance']);
    assert.ok(rt.calls[0].prompt.includes('read the file `docs/plans/widget.md`'), 'a string arg is the plan file');
    assert.ok(rt.calls[1].prompt.includes('## Data model'), 'the reviewers get the plan text');
    assert.deepEqual(result.failed, []);

    // 4 raw findings → 2 after dedupe: findings on one plan section merge (the higher severity wins, every
    // reviewer and claim is kept, an adr tag from either survives), so §Data model and §Rollout are one each.
    assert.equal(result.findings.length, 2);
    const data = result.findings.find((f) => f.section === 'Data model');
    assert.equal(data.severity, 'blocker');
    assert.deepEqual(data.reviewers.sort(), ['design-review-architecture', 'design-review-risk-governance']);
    assert.equal(data.claims.length, 2);
    assert.equal(data.adr, false);
    const rollout = result.findings.find((f) => f.section === 'Rollout');
    assert.equal(rollout.severity, 'major');
    assert.equal(rollout.adr, true);
    assert.deepEqual(rollout.reviewers.sort(), ['design-review-feasibility', 'design-review-risk-governance']);
    assert.equal(rt.calls.filter((c) => c.opts.label?.startsWith('verify:')).length, 2, 'one skeptic per blocker/major after dedupe');
    assert.match(data.verification, /^confirmed/);
    assert.match(rollout.verification, /^confirmed/);
    assert.equal(result.verdict, 'rethink');
    assert.deepEqual(result.counts, { blocker: 1, major: 1, minor: 0, note: 0 });
    assert.deepEqual(result.adrs.map((a) => a.section), ['Rollout']);
    assert.equal(result.adrs[0].decision, 'fix the backfill runs before the column exists');
  });

  test('a refuted blocker is demoted to a note (revise on the surviving major), and a clean plan is sound', async () => {
    const rt = runtime({
      scope: planScope,
      reviews: {
        'design-review-architecture': { headline: 'x', checked: 'read', findings: [planFinding('blocker', 'no seam for the storefront', 'Widget')] },
        'design-review-feasibility': { headline: 'y', checked: 'read', findings: [planFinding('major', 'no migration named', 'Rollout')] },
      },
      verdicts: { 'no seam for the storefront': { refuted: true, reason: 'the plan §Rollout names the proxy route', severity: 'note' } },
    });
    const result = await run('plan-review', rt, { pr: '7' });
    assert.ok(rt.calls[0].prompt.includes('the body of PR #7'), 'args.pr reads the PR body');
    assert.equal(result.verdict, 'revise');
    const seam = result.findings.find((f) => f.section === 'Widget');
    assert.equal(seam.severity, 'note');
    assert.match(seam.verification, /^refuted: the plan/);
    assert.equal(result.refuted.length, 1);
    assert.deepEqual(result.adrs, []);

    const quiet = runtime({ scope: planScope, reviews: {}, verdicts: {} });
    const ok = await run('plan-review', quiet, '#12');
    assert.ok(quiet.calls[0].prompt.includes('the body of issue #12'), '"#<n>" reads the issue body');
    assert.equal(ok.verdict, 'sound');
    assert.equal(ok.findings.length, 0);
    assert.equal(quiet.calls.filter((c) => c.opts.label?.startsWith('verify:')).length, 0);
  });

  test('a reviewer that returns nothing is recorded as failed and the verdict is never sound; args.reviewers restricts the roster', async () => {
    const rt = runtime({ scope: planScope, reviews: { 'design-review-feasibility': null }, verdicts: {} });
    const result = await run('plan-review', rt, { plan: 'PLAN.md', reviewers: ['design-review-feasibility', 'design-review-product-intent'] });
    assert.deepEqual(launchedAgents(rt), ['design-review-feasibility', 'design-review-product-intent']);
    assert.deepEqual(result.skipped.map((s) => s.name), ['design-review-architecture', 'design-review-risk-governance']);
    assert.deepEqual(result.failed, ['design-review-feasibility']);
    assert.equal(result.findings.length, 0);
    assert.equal(result.verdict, 'revise');
    assert.ok(rt.logs.some((l) => /design-review-feasibility returned nothing/.test(l)));
  });

  test('no plan is rethink without launching a reviewer', async () => {
    const rt = runtime({ scope: { ...planScope, planFound: false, plan: '', notes: 'no plan file on this branch' }, reviews: {}, verdicts: {} });
    const result = await run('plan-review', rt, undefined);
    assert.equal(result.verdict, 'rethink');
    assert.equal(rt.calls.length, 1);
    assert.match(result.notes, /no plan to review/);
  });
});

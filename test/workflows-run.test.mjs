// Runs workflows/pre-pr-review.js under a stub of the Workflow runtime (agent/parallel/phase/log/args) with
// canned reviewer output, so the script's own logic is tested offline: roster selection from the scope, dedupe
// of findings on the same spot, a refuted finding demoted to a note, a reviewer that returns nothing recorded as
// failed, and the verdict on the review skill's scale.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const script = fs.readFileSync(path.resolve(here, '..', 'workflows', 'pre-pr-review.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// The runtime wraps the body in an async function (top-level `return` is allowed); mirror that.
function load() {
  return new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', script.replace(/^export const meta/, 'const meta'));
}

function runtime({ scope, reviews, verdicts }) {
  const calls = [];
  const logs = [];
  const phases = [];
  const agent = async (prompt, opts = {}) => {
    calls.push({ prompt, opts });
    if (opts.label === 'scope') return scope;
    if (opts.agentType) {
      const name = opts.agentType.replace('shopify-app-kit:', '');
      assert.equal(opts.phase, 'Review');
      return name in reviews ? reviews[name] : { headline: 'nothing found', findings: [], checked: 'read the diff' };
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

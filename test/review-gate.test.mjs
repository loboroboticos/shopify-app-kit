// hooks/review-gate.mjs and hooks/kit-review-gate.yml: the receipt format (parse, render, splice, link), the
// independentFor globs, the manifest's review.models mapping, the gate's decision table against a fake GitHub API,
// the workflow's security posture (pull_request_target from the base, read-only, no PR code, no event text in a
// run line), the CLI, the doctor's review checks, and no agent pinning opus. Zero dependencies.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kitRoot, read } from './lib/fs.mjs';
import { KIT_VERSION, run } from './lib/kit.mjs';
import * as g from '../hooks/review-gate.mjs';

const script = path.join(kitRoot, 'hooks', 'review-gate.mjs');
const yml = read('hooks', 'kit-review-gate.yml');
const A = 'a'.repeat(40); const B = 'b'.repeat(40); const C = 'c'.repeat(40); const X = 'f'.repeat(40);
const receipt = (o = {}) => ({ v: 1, kind: 'pre-pr-review', sha: A, base: 'main', verdict: 'approve', confirmed: 0, roster: ['review-quality'], models: { 'review-quality': 'sonnet' }, independent: null, ...o });
const body = (r, pre = 'What changed.\n') => `${pre}\n${g.renderReceipt(r)}\n`;
const manifest = (o = {}) => ({ branches: { default: 'main' }, paths: { webhookHandlers: 'app/routes/webhooks', prisma: 'prisma', appTomls: ['shopify.app.toml'], extensions: ['extensions/theme'] }, ...o });
const url = (id) => `https://github.com/o/r/pull/7#pullrequestreview-${id}`;
const pull = (o = {}) => ({ number: 7, draft: false, base: { ref: 'main' }, head: { sha: A }, body: body(receipt()), labels: [], user: { login: 'dev' }, author_association: 'COLLABORATOR', ...o });
const api = ({ reviews = {}, ancestors = [A, B, C], comments = [] } = {}) => ({
  comments: async () => comments,
  review: async (id) => reviews[id] ?? null,
  isAncestor: async (sha) => ancestors.includes(sha),
});
const gate = (o = {}) => g.gate({ manifest: manifest(), pull: pull(), files: ['app/lib/util.ts'], repo: 'o/r', event: {}, api: api(), ...o });
const ind = (sha, o = {}) => ({ state: 'COMMENTED', commit_id: sha, user: { login: 'dev' }, author_association: 'OWNER', body: `Findings.\n\n${g.renderReceipt(receipt({ kind: 'independent', sha, reviewerSession: 'session_x' }))}`, ...o });

describe('review receipt format', () => {
  test('render then parse round-trips, CRLF bodies included', () => {
    const r = receipt();
    assert.deepEqual(g.parseReceipt(body(r)).receipt, r);
    assert.deepEqual(g.parseReceipt(body(r).replace(/\n/g, '\r\n')).receipt, r);
  });
  const bad = [
    ['no receipt', 'just prose', /no review receipt/],
    ['two markers', `${body(receipt())}\n${g.OPEN}`, /more than one/],
    ['no closing marker', `${g.OPEN}\n\`\`\`json\n{}\n\`\`\``, /no closing marker/],
    ['not JSON', `${g.OPEN}\n\`\`\`json\n{nope}\n\`\`\`\n${g.CLOSE}`, /not valid JSON/],
    ['short sha', body(receipt({ sha: 'abc' })), /sha must be 40/],
    ['unknown kind', body(receipt({ kind: 'vibes' })), /unknown kind/],
    ['bad verdict', body(receipt({ verdict: 'lgtm' })), /verdict must be/],
    ['a full review with a chain', body(receipt({ chain: [{ kind: 'review', sha: B }] })), /carries no chain/],
    ['a delta without fromSha', body(receipt({ kind: 'delta', chain: [{ kind: 'review', sha: B }] })), /needs fromSha/],
    ['a delta that skips a link', body(receipt({ kind: 'delta', fromSha: C, chain: [{ kind: 'review', sha: B }] })), /not the previous link/],
    ['a chain that starts with a delta', body(receipt({ kind: 'delta', fromSha: B, chain: [{ kind: 'delta', sha: B, fromSha: C }] })), /starts with a full review/],
    ['independent not an array', body(receipt({ independent: { url: 'x', sha: A } })), /independent must be/],
  ];
  for (const [label, text, re] of bad) test(`parse rejects ${label}`, () => assert.match(g.parseReceipt(text).error, re));

  test('a delta chained to a full review parses; chainOf lists it oldest first', () => {
    const r = receipt({ kind: 'delta', sha: A, fromSha: B, chain: [{ kind: 'pre-pr-review', sha: C }, { kind: 'delta', sha: B, fromSha: C }] });
    assert.deepEqual(g.parseReceipt(body(r)).receipt, r);
    assert.deepEqual(g.chainOf(r).links.map((l) => l.sha), [C, B, A]);
  });

  test('splice replaces the block in place, appends when absent, and refuses a malformed receipt or two markers', () => {
    const before = `Intro.\n\n${g.renderReceipt(receipt())}\n\nOutro.\n`;
    const after = g.spliceReceipt(before, receipt({ verdict: 'block', confirmed: 2 }));
    assert.ok(after.startsWith('Intro.\n\n') && after.endsWith('\n\nOutro.\n'));
    assert.equal(g.parseReceipt(after).receipt.verdict, 'block');
    assert.equal(g.parseReceipt(g.spliceReceipt('Body.', receipt())).receipt.sha, A);
    assert.equal(g.parseReceipt(g.spliceReceipt('', receipt())).receipt.sha, A);
    assert.throws(() => g.spliceReceipt('x', receipt({ sha: 'nope' })), /malformed/);
    assert.throws(() => g.spliceReceipt(`${before}${g.OPEN}`, receipt()), /more than one/);
  });

  test('link: a posted independent review becomes the body receipt, resets the chain, or extends it as a delta', () => {
    const posted = receipt({ kind: 'independent', sha: B });
    const fresh = g.parseReceipt(g.linkIndependent('Body.', posted, url(1))).receipt;
    assert.equal(fresh.kind, 'independent');
    assert.deepEqual(fresh.independent, [{ url: url(1), sha: B }]);
    const own = g.parseReceipt(g.linkIndependent(body(receipt({ independent: [{ url: url(0), sha: C }] })), posted, url(1))).receipt;
    assert.equal(own.kind, 'pre-pr-review');
    assert.deepEqual(own.independent, [{ url: url(1), sha: B }]);
    const delta = receipt({ kind: 'independent-delta', sha: A, fromSha: B, chain: [{ kind: 'independent', sha: B }] });
    const ext = g.parseReceipt(g.linkIndependent(body(receipt({ independent: [{ url: url(1), sha: B }] })), delta, url(2))).receipt;
    assert.deepEqual(ext.independent.map((l) => l.sha), [B, A]);
    assert.throws(() => g.linkIndependent('x', receipt(), url(1)), /only an independent/);
  });
});

describe('independentFor and models', () => {
  test('glob matching: ** spans directories, * and ? stay in a segment, a plain path covers its subtree', () => {
    const m = (glob, p) => g.globToRegExp(glob).test(p);
    assert.ok(m('app/billing/**', 'app/billing/plans/a.ts') && m('app/billing/**', 'app/billing/x.ts'));
    assert.ok(m('**/*.toml', 'shopify.app.toml') && m('**/*.toml', 'a/b/c.toml'));
    assert.ok(m('app/*.server.ts', 'app/shopify.server.ts') && !m('app/*.server.ts', 'app/x/shopify.server.ts'));
    assert.ok(m('app/entitlement', 'app/entitlement/grant.ts') && m('./app/entitlement/', 'app/entitlement'));
    assert.ok(!m('app/entitlement', 'app/entitlements.ts') && !m('a?c', 'a/c') && m('a.c', 'a.c') && !m('a.c', 'abc'));
  });

  test('the derived set covers the gate, the manifest and the risky manifest paths, then review.independentFor', () => {
    const fixture = JSON.parse(read('test', 'fixtures', 'manifests', 'npm-root-app.json'));
    const globs = g.independentGlobs({ ...fixture, review: { independentFor: ['web/app/billing/**'] } });
    for (const want of [...g.ALWAYS_INDEPENDENT, 'web/app/routes/**', 'web/prisma/**', 'extensions/example/**', 'web/app/billing/**', ...fixture.paths.appTomls]) assert.ok(globs.includes(want), want);
    assert.deepEqual(g.independentGlobs({ paths: { prisma: '.' } }), [...g.ALWAYS_INDEPENDENT, '**']);
    assert.deepEqual(g.independentGlobs(null), g.ALWAYS_INDEPENDENT);
  });

  test('review.models maps default to reviewer, skeptic and judgment, mechanical to scope, agent names through; junk drops', () => {
    assert.deepEqual(g.modelsArgs({ review: { models: { default: 'sonnet', mechanical: 'haiku', 'qa-review-security-governance': 'opus', bad: 'Opus 4!', toString: 3 } } }),
      { reviewer: 'sonnet', skeptic: 'sonnet', judgment: 'sonnet', scope: 'haiku', 'qa-review-security-governance': 'opus' });
    assert.deepEqual(g.modelsArgs({}), {});
  });

  test('clean neutralises workflow commands, newlines and markdown in attacker text', () => {
    const s = g.clean('ok\n::error::pwn %0A [x](y) <img>', 400);
    assert.doesNotMatch(s, /\n|::|%/);
    assert.match(s, /\\\[x\\\]/);
    assert.equal(g.clean('x'.repeat(500)).length, 200);
  });
});

describe('the gate', () => {
  test('a current approve passes; changes-needed passes with a warning; block fails', async () => {
    assert.equal((await gate()).status, 'pass');
    const warn = await gate({ pull: pull({ body: body(receipt({ verdict: 'changes-needed', confirmed: 1 })) }) });
    assert.equal(warn.status, 'pass'); assert.match(warn.warnings[0], /changes-needed/);
    assert.match((await gate({ pull: pull({ body: body(receipt({ verdict: 'block', confirmed: 1 })) }) })).errors.join(), /verdict is block/);
  });

  test('missing, malformed or stale receipts fail with the fix', async () => {
    assert.match((await gate({ pull: pull({ body: 'no receipt' }) })).errors[0], /no review receipt.*pre-pr-review/);
    assert.match((await gate({ pull: pull({ body: `${g.OPEN} quoted` }) })).errors[0], /no closing marker/);
    const stale = await gate({ pull: pull({ head: { sha: X } }), api: api({ ancestors: [A] }) });
    assert.equal(stale.status, 'fail'); assert.match(stale.errors[0], /stale/);
  });

  test('a delta chain ending at the head passes; a link that is not an ancestor fails', async () => {
    const r = receipt({ kind: 'delta', sha: A, fromSha: B, chain: [{ kind: 'pre-pr-review', sha: B }] });
    assert.equal((await gate({ pull: pull({ body: body(r) }) })).status, 'pass');
    const res = await gate({ pull: pull({ body: body(r) }), api: api({ ancestors: [A] }) });
    assert.match(res.errors.join(), /not an ancestor/);
  });

  test('skips PRs into other branches and drafts; fails closed without branches.default', async () => {
    assert.equal((await gate({ pull: pull({ base: { ref: 'beta' }, body: '' }) })).status, 'skip');
    assert.equal((await gate({ pull: pull({ draft: true, body: '' }) })).status, 'skip');
    assert.equal((await gate({ manifest: {} })).status, 'fail');
  });

  test('the override needs the label and a role-holder comment naming this exact head', async () => {
    const labels = [{ name: g.OVERRIDE_LABEL }];
    const said = (sha, o = {}) => ({ body: `Going in.\nReview-gate override ${sha}: prod down; hotfix #12\n::error::x`, author_association: 'MEMBER', user: { login: 'maint' }, ...o });
    const ok = await gate({ pull: pull({ labels, body: 'none' }), api: api({ comments: [said(A)] }) });
    assert.equal(ok.status, 'pass'); assert.match(ok.warnings[0], /overridden for aaaaaaa by maint: prod down/);
    assert.deepEqual(ok.override, { reason: 'prod down; hotfix \\#12', by: 'maint' });
    for (const [label, comments, body] of [
      ['no comment, only a body line', [], `Review-gate override ${A}: me`],
      ['a comment for an earlier head (a push after the override)', [said(B)], ''],
      ['a comment by someone with no role (the fork author)', [said(A, { author_association: 'CONTRIBUTOR' })], ''],
      ['a short sha', [said(A.slice(0, 12))], ''],
    ]) assert.equal((await gate({ pull: pull({ labels, body }), api: api({ comments }) })).status, 'fail', label);
    // By design a role-holder may override their own PR (every session may post as one account); the comment names them.
    assert.equal((await gate({ pull: pull({ labels }), api: api({ comments: [said(A, { user: { login: 'dev' }, author_association: 'COLLABORATOR' })] }) })).override.by, 'dev');
  });

  test('a PR whose author has no role needs an independent review on any path; only a standing COMMENT review counts', async () => {
    const res = await gate({ pull: pull({ author_association: 'FIRST_TIME_CONTRIBUTOR' }) });
    assert.equal(res.status, 'fail'); assert.match(res.errors[0], /no independent review/);
    assert.ok(res.notes.some((n) => /PR author \(FIRST\\_TIME\\_CONTRIBUTOR\) has no role/.test(n)), res.notes.join('|'));
    const linked = pull({ author_association: 'NONE', body: body(receipt({ independent: [{ url: url(5), sha: A }] })) });
    assert.equal((await gate({ pull: linked, api: api({ reviews: { 5: ind(A) } }) })).status, 'pass');
    assert.match((await gate({ pull: linked, api: api({ reviews: { 5: ind(A, { state: 'APPROVED' }) } }) })).errors.join(), /APPROVED, not a standing COMMENT/);
  });

  test('a changed independentFor path needs a verified independent review chain ending at the head', async () => {
    const risky = ['app/routes/webhooks/orders.ts'];
    const withLinks = (links, o = {}) => pull({ body: body(receipt({ independent: links })), ...o });
    assert.match((await gate({ files: risky })).errors[0], /no independent review/);
    const good = await gate({ files: risky, pull: withLinks([{ url: url(5), sha: A }]), api: api({ reviews: { 5: ind(A) } }) });
    assert.equal(good.status, 'pass', good.errors.join());
    assert.ok(good.notes.some((n) => /review 5 by dev \(OWNER\), session session\\_x, the same account as the PR author/.test(n)), good.notes.join('|'));
    const cases = [
      ['another PR', [{ url: 'https://github.com/o/r/pull/8#pullrequestreview-5', sha: A }], {}, /not a review on this PR/],
      ['another repo', [{ url: 'https://github.com/o/rr/pull/7#pullrequestreview-5', sha: A }], {}, /not a review on this PR/],
      ['a missing review', [{ url: url(6), sha: A }], {}, /does not exist/],
      ['a dismissed review', [{ url: url(5), sha: A }], { 5: ind(A, { state: 'DISMISSED' }) }, /DISMISSED, not a standing/],
      ['a review by someone with no role on the repo', [{ url: url(5), sha: A }], { 5: ind(A, { author_association: 'CONTRIBUTOR', user: { login: 'forker' } }) }, /forker \(CONTRIBUTOR\), who has no role/],
      ['a review on another commit', [{ url: url(5), sha: A }], { 5: ind(B) }, /posted on bbbbbbb/],
      ['a review body without a receipt', [{ url: url(5), sha: A }], { 5: ind(A, { body: 'LGTM' }) }, /does not carry a independent receipt/],
      ['a chain that stops short of the head', [{ url: url(5), sha: B }], { 5: ind(B) }, /ends at bbbbbbb/],
    ];
    for (const [label, links, reviews, re] of cases) {
      const res = await gate({ files: risky, pull: withLinks(links), api: api({ reviews }) });
      assert.equal(res.status, 'fail', label); assert.match(res.errors.join(' | '), re, label);
    }
  });

  test('an independent-delta extends the chain; renamed-away paths, the gate files and an over-cap PR count as risky', async () => {
    const delta = { state: 'COMMENTED', commit_id: A, user: { login: 'dev' }, author_association: 'MEMBER', body: g.renderReceipt(receipt({ kind: 'independent-delta', sha: A, fromSha: B, chain: [{ kind: 'independent', sha: B }] })) };
    const p = pull({ body: body(receipt({ independent: [{ url: url(5), sha: B }, { url: url(6), sha: A }] })) });
    assert.equal((await gate({ files: ['prisma/schema.prisma'], pull: p, api: api({ reviews: { 5: ind(B), 6: delta } }) })).status, 'pass');
    // Each independent link must be an ancestor of the head, and each delta must start where the previous link ended.
    const orphan = await gate({ files: ['prisma/schema.prisma'], pull: p, api: api({ reviews: { 5: ind(B), 6: delta }, ancestors: [A] }) });
    assert.match(orphan.errors.join(), /review 5's commit is not an ancestor of the head/);
    const skip = { ...delta, body: g.renderReceipt(receipt({ kind: 'independent-delta', sha: A, fromSha: C, chain: [{ kind: 'independent', sha: C }] })) };
    assert.match((await gate({ files: ['prisma/schema.prisma'], pull: p, api: api({ reviews: { 5: ind(B), 6: skip } }) })).errors.join(), /review 6's own body does not carry a independent-delta receipt for aaaaaaa from bbbbbbb/);
    for (const files of [['.github/kit/review-gate.mjs'], ['.claude/shopify-app.json'], ['.github/workflows/kit-review-gate.yml'], ['.github/workflows/new-check.yml'], ['shopify.app.toml'], null]) {
      assert.match((await gate({ files })).errors.join(), /no independent review/, JSON.stringify(files));
    }
  });
});

describe('the workflow file', () => {
  const lines = yml.split('\n');
  test('carries the kit header and the script carries it on line 2 after its shebang', () => {
    assert.equal(lines[1], `# shopify-app-kit v${KIT_VERSION}`);
    const js = read('hooks', 'review-gate.mjs').split('\n');
    assert.equal(js[0], '#!/usr/bin/env node');
    assert.equal(js[1], `// shopify-app-kit v${KIT_VERSION}`);
  });
  test('runs from the base on pull_request_target for every event that changes what it judges', () => {
    assert.match(yml, /^on:\n {2}pull_request_target:\n {4}types: \[opened, synchronize, reopened, edited, labeled, unlabeled, ready_for_review\]$/m);
    assert.doesNotMatch(yml, /^\s+pull_request:/m);
  });
  test('the gate job reads only; the one write, statuses, sits alone in a job that checks nothing out and runs no PR code', () => {
    assert.match(yml, /^permissions: \{\}$/m, 'the workflow default grants nothing');
    assert.match(yml, /^ {2}gate:\n {4}name: gate\n[\s\S]*? {4}permissions:\n {6}contents: read\n {6}pull-requests: read\n {6}issues: read\n {4}outputs:/m);
    const status = yml.slice(yml.indexOf('\n  status:'));
    assert.match(status, /^ {4}permissions:\n {6}statuses: write\n {4}env:/m);
    assert.equal((yml.match(/: write/g) ?? []).length, 1, 'statuses: write is the only write anywhere');
    assert.doesNotMatch(status, /^\s+(- )?uses:|actions\/checkout/m, 'the status job checks nothing out and runs no action');
    assert.match(status, /context: 'shopify-app-kit\/review-gate'/);
    assert.match(status, /^ {4}needs: gate\n {4}if: always\(\)$/m, 'a failed or crashed gate still posts a status');
    for (const o of ['state', 'sha', 'description']) assert.match(yml, new RegExp(`^ {6}${o}: \\$\\{\\{ steps\\.check\\.outputs\\.${o} \\}\\}$`, 'm'), o);
    assert.match(yml, /^ {8}id: check$/m);
    // A fork can only reach this workflow through pull_request_target, which runs the base's copy; no pull_request
    // trigger means no run where a fork's code and a token that can write statuses meet.
    assert.doesNotMatch(yml, /^\s+(pull_request|push|workflow_run):/m);
    assert.doesNotMatch(yml, /secrets\./);
    assert.doesNotMatch(yml, /^\s+ref:/m, 'the checkout is the base');
    assert.match(yml, /persist-credentials: false/);
    for (const u of yml.match(/^\s+(?:- )?uses: \S+/gm)) assert.match(u, /@[0-9a-f]{40}$/, `${u} is pinned by SHA`);
    const runs = lines.filter((l) => /^\s+run:/.test(l));
    assert.deepEqual(runs.map((l) => l.trim()), ['run: node .github/kit/review-gate.mjs check', 'run: node -e "$POST"']);
    assert.doesNotMatch(yml.slice(yml.indexOf('POST: |')), /\$\{\{/, 'the posting code holds no expression');
    assert.match(yml, /cancel-in-progress: false/);
    assert.match(yml, /^name: kit-review-gate$/m); assert.match(yml, /^ {2}gate:\n {4}name: gate$/m);
  });
});

describe('the independent-review allowlist', () => {
  // Pinned exactly: widening it fails here. Each entry is checked for option injection: `git -c`/`--config` cannot
  // follow a subcommand prefix; `git fetch origin` names an https remote, so `--upload-pack`/`--receive-pack` are
  // ignored, and `ext::` stays off (protocol.ext.allow defaults to never); diff and textconv drivers need git config,
  // which a PR cannot set; jq, gh pr view and gh issue view only read. Running node, gh api, gh pr edit always asks.
  test('pre-approves exactly the read-only commands its steps use', () => {
    const line = read('skills', 'independent-review', 'SKILL.md').split('\n').find((l) => l.startsWith('allowed-tools:'));
    assert.equal(line, 'allowed-tools: Read, Write, Grep, Glob, Bash(git fetch origin *), Bash(git checkout --detach *), Bash(git show *), Bash(git diff *), Bash(git rev-parse *), Bash(git merge-base *), Bash(git ls-tree *), Bash(jq *), Bash(gh pr view *), Bash(gh issue view *)');
    for (const bad of ['Bash(node', 'Bash(gh api', 'Bash(gh pr edit', 'Bash(git *)', 'Bash(git -c', 'Bash(git fetch *)', 'Bash(git push', 'Bash(gh pr *)']) assert.ok(!line.includes(bad), bad);
  });
});

describe('the status outputs', () => {
  test('fail is failure, pass, skip and override are success; one ASCII line each; a bad sha posts none', () => {
    const out = (res, sha = A) => Object.fromEntries(g.statusOutputs({ errors: [], warnings: [], notes: [], ...res }, sha).split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
    assert.deepEqual(out({ status: 'fail', errors: ['bad ::error:: x\ny é'] }), { state: 'failure', sha: A, description: '1 problem(s): bad ::error:: x y  ' });
    assert.equal(out({ status: 'pass' }).state, 'success');
    assert.equal(out({ status: 'pass', override: { reason: 'prod down' } }).description, 'overridden: prod down');
    assert.equal(out({ status: 'skip', notes: ['draft PR'] }).description, 'not gated: draft PR');
    assert.equal(out({ status: 'pass' }, 'nope\nstate=success').sha, '');
    assert.equal(g.statusOutputs({ status: 'fail', errors: ['x'.repeat(500)] }, A).split('\n').length, 4);
  });
});

describe('the CLI', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-gate-'));
  const f = (name, text) => { const p = path.join(dir, name); fs.writeFileSync(p, text); return p; };
  test('splice and link print the new body; models, globs and touched read the manifest', () => {
    const r = run(process.execPath, [script, 'splice', f('body.md', 'Hello.\n'), f('r.json', JSON.stringify(receipt()))]);
    assert.equal(r.status, 0, r.stderr); assert.equal(g.parseReceipt(r.stdout).receipt.sha, A);
    const l = run(process.execPath, [script, 'link', f('b2.md', r.stdout), f('i.json', JSON.stringify(receipt({ kind: 'independent' }))), url(9)]);
    assert.deepEqual(g.parseReceipt(l.stdout).receipt.independent, [{ url: url(9), sha: A }]);
    const m = f('m.json', JSON.stringify(manifest({ review: { models: { default: 'sonnet' }, independentFor: ['app/billing/**'] } })));
    assert.deepEqual(JSON.parse(run(process.execPath, [script, 'models', m]).stdout), { reviewer: 'sonnet', skeptic: 'sonnet', judgment: 'sonnet' });
    assert.match(run(process.execPath, [script, 'globs', m]).stdout, /^app\/billing\/\*\*$/m);
    const t = run(process.execPath, [script, 'touched', m], { input: 'app/billing/a.ts\nREADME.md\nprisma/schema.prisma\n' });
    assert.equal(t.stdout, 'app/billing/a.ts\nprisma/schema.prisma\n');
    assert.equal(run(process.execPath, [script, 'splice', f('b3.md', 'x'), f('bad.json', '{"v":2}')]).status, 1);
    const rc = run(process.execPath, [script, 'receipt'], { input: `secret author prose\n${g.renderReceipt(receipt())}` });
    assert.deepEqual(JSON.parse(rc.stdout), receipt()); assert.doesNotMatch(rc.stdout, /secret/);
    assert.equal(run(process.execPath, [script, 'receipt'], { input: 'none' }).status, 1);
    assert.equal(run(process.execPath, [script]).status, 2);
  });
});

describe('the doctor and the agents', () => {
  test('the doctor flags bad review keys and a synced repo without the gate files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-doctor-'));
    fs.mkdirSync(path.join(dir, '.claude')); fs.mkdirSync(path.join(dir, '.github'));
    const m = JSON.parse(read('test', 'fixtures', 'manifests', 'npm-root-app.json'));
    fs.writeFileSync(path.join(dir, '.claude', 'shopify-app.json'), JSON.stringify({ ...m, kit: { ...m.kit, version: KIT_VERSION }, review: { independentFor: ['a/**', 3], models: { default: 'Sonnet 4!' } } }));
    const env = { ...process.env }; delete env.CLAUDE_PROJECT_DIR; delete env.SHOPIFY_APP_KIT_MANIFEST; delete env.SHOPIFY_APP_KIT_ROOT;
    const out = run('bash', [path.join(kitRoot, 'hooks', 'doctor.sh')], { input: JSON.stringify({ cwd: dir }), env }).stdout;
    assert.match(out, /review\.independentFor must be an array of path globs/);
    assert.match(out, /review\.models must map/);
    assert.match(out, /\.github\/kit\/review-gate\.mjs is missing/);
    assert.match(out, /\.github\/workflows\/kit-review-gate\.yml is missing/);
  });
  test('no agent pins opus; a consumer raises one through review.models', () => {
    for (const f of fs.readdirSync(path.join(kitRoot, 'agents'))) assert.doesNotMatch(read('agents', f), /^model: opus$/m, f);
  });
});

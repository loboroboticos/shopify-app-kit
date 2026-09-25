// routines/ holds the committed prompt texts of the scheduled Routines. Every routine file has the five header
// fields (Cadence, Environment, Tools, May touch, Never), a `## Prompt` section written for a fresh session,
// a row in routines/REGISTRY.md, no repository literal (the prompt derives the repo from the git remote), and
// the phrase "never closes a `human:*` issue" (or the registry's shared preamble carries it). Zero dependencies.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kitRoot } from './lib/fs.mjs';

const dir = path.join(kitRoot, 'routines');
const registry = fs.readFileSync(path.join(dir, 'REGISTRY.md'), 'utf8');
const portfolio = JSON.parse(fs.readFileSync(path.join(kitRoot, 'portfolio.json'), 'utf8'));

const HEADER_FIELDS = ['Cadence', 'Environment', 'Tools', 'May touch', 'Never'];
const NEVER_CLOSES = 'never closes a `human:*` issue';
const CRON = /^(\S+ ){4}\S+$/;
// A repository literal: a github.com URL, an <owner>/<repo> after a --repo/-R flag, or a .git remote; the
// placeholders `<owner>/<repo>` and the kit's own manifest paths are fine.
const REPO_LITERALS = [/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/, /(--repo|-R)[ =][A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/, /[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\.git\b/];

const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && f !== 'REGISTRY.md').sort();
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
const tableRows = [...registry.matchAll(/^\| `([a-z-]+)\.md` \| ([^|]+) \|/gm)].map((m) => ({ file: `${m[1]}.md`, cadence: m[2].trim() }));

describe('routines/', () => {
  test('the seven routines exist', () => {
    assert.deepEqual(files, ['dependency-wave.md', 'dev-parity.md', 'graphify-refresh.md', 'kit-health.md', 'nuclear-review.md', 'pr-steward.md', 'triage.md']);
  });

  for (const f of files) {
    test(`routines/${f}`, () => {
      const text = read(f);
      const name = path.basename(f, '.md');
      assert.ok(text.startsWith(`# ${name}\n`), `starts with "# ${name}"`);
      const promptAt = text.indexOf('\n## Prompt\n');
      assert.ok(promptAt > 0, 'has a ## Prompt section');
      const header = text.slice(0, promptAt);
      const prompt = text.slice(promptAt + '\n## Prompt\n'.length);
      for (const field of HEADER_FIELDS) assert.match(header, new RegExp(`^- \\*\\*${field}:\\*\\* `, 'm'), `header field ${field}`);
      assert.ok(prompt.trim().split('\n').length >= 15, 'the prompt is a complete standalone instruction');
      assert.ok(!/\n## /.test(prompt), 'the prompt is the last section');
      // Parameterised by the manifest and the label set; the repo comes from the remote.
      for (const s of ['.claude/shopify-app.json', 'branches.default', 'branches.protected', 'deploy.protectedWorkflows', 'labels.json', 'git remote']) {
        assert.ok(prompt.includes(s), `the prompt reads ${s}`);
      }
      assert.ok(text.includes(NEVER_CLOSES) || registry.includes(NEVER_CLOSES), `says "${NEVER_CLOSES}"`);
      assert.ok(prompt.includes('never closes a `human:*` issue'), 'the prompt itself carries the rule (it is pasted verbatim into the trigger)');
      for (const re of REPO_LITERALS) assert.doesNotMatch(text, re, `names a repository (${re})`);
      assert.ok(!/\b(gh|git) .*(--repo|-R) [a-z]/.test(text), 'no --repo with a literal');
      // Listed in the registry with a five-field cron.
      const row = tableRows.find((r) => r.file === f);
      assert.ok(row, `routines/REGISTRY.md has a row for ${f}`);
      const cron = row.cadence.match(/`([^`]+)`/)?.[1];
      assert.ok(cron && CRON.test(cron), `the registry row carries a five-field cron (${row.cadence})`);
      assert.ok(header.includes(`\`${cron}\``), `the header's Cadence line carries the same cron ${cron}`);
      assert.notEqual(cron.split(' ')[0], '0', 'cron minute is off the hour');
    });
  }

  test('cron minutes are distinct across routines', () => {
    const minutes = tableRows.map((r) => r.cadence.match(/`(\d+) /)?.[1]);
    assert.equal(new Set(minutes).size, minutes.length, minutes.join(','));
  });

  test('the registry lists only routines that exist and explains the trigger step', () => {
    for (const r of tableRows) assert.ok(files.includes(r.file), `${r.file} is in the table but not in routines/`);
    assert.equal(tableRows.length, files.length);
    assert.ok(registry.includes('create_trigger'));
    assert.ok(registry.includes('create_new_session_on_fire: true'));
    assert.ok(registry.includes('cron_expression'));
    assert.ok(registry.includes(NEVER_CLOSES));
    for (const s of ['`triage.md`', '`nuclear-review.md`', '`pr-steward.md`', '`kit-health.md`', '`graphify-refresh.md`', '`dependency-wave.md`', '`dev-parity.md`']) assert.ok(registry.includes(s), s);
  });

  test('the triage prompt has the six steps in order and the 13th-run sweep', () => {
    const t = read('triage.md');
    const steps = ['Step 1, lint', 'Step 2, decisions', 'Step 3, bootstraps', 'Step 4, scheduled workflows', 'Step 5, re-score', 'Step 6, rewrite the queue issue'];
    let last = -1;
    for (const s of steps) { const i = t.indexOf(s); assert.ok(i > last, `${s} in order`); last = i; }
    for (const s of ['stop after step 6', 'decision:', 'unblocked by the decision on #N', 'unblocked by #B', '30 days', 'older than 8 days', 'older than 15', '403', 'actions: write', 'Every 13th run', '90 days']) assert.ok(t.includes(s), s);
  });

  test('the other prompts keep their boundaries', () => {
    const nuclear = read('nuclear-review.md');
    for (const s of ['/shopify-app-kit:review', 'never a PR', 'same title prefix', 'blocker or major']) assert.ok(nuclear.toLowerCase().includes(s.toLowerCase()), `nuclear-review: ${s}`);
    const steward = read('pr-steward.md');
    for (const s of ['never merge', 'Merge conflict', 'Red CI', 'Never skip, disable or quarantine', 'force-push']) assert.ok(steward.includes(s), `pr-steward: ${s}`);
    const health = read('kit-health.md');
    for (const s of ['/shopify-app-kit:doctor', 'git ls-remote --tags', 'shopify-dev', '3 months', 'portfolio.json']) assert.ok(health.includes(s), `kit-health: ${s}`);
    const graph = read('graphify-refresh.md');
    for (const s of ['graph/', '--force-with-lease', 'graphify-out/', '.claudeignore', 'nothing merged since']) assert.ok(graph.includes(s), `graphify-refresh: ${s}`);
    assert.doesNotMatch(graph, /force-with-lease origin (main|master)\b/);
    const deps = read('dependency-wave.md');
    for (const s in { '--audit-level=high': 1, 'dependabot.yml': 1, 'semver-major': 1, '`dependencies`, `agent:ci`': 1 }) assert.ok(deps.includes(s), `dependency-wave: ${s}`);
    const parity = read('dev-parity.md');
    for (const s of ['shopifyCli.configs', 'paths.appTomls', 'deploy.targets.beta', 'branches.promotion', 'billing.testFlag', 'checks.tripwireDir', 'repo preamble', 'unverified', 'first 7 days', 'dev-parity: <the drift in six words>', 'for that title prefix', '`human:account`', 'never with a closing', 'no workflow dispatch of any kind', 'no Shopify CLI', 'no Fly CLI', 'raw health response', 'No PR and no push']) assert.ok(parity.includes(s), `dev-parity: ${s}`);
    assert.doesNotMatch(parity, /\b(closes|fixes|resolves) #/i, 'dev-parity: no closing keyword');
  });

  test('portfolio.json lists routines that exist, with one placeholder product', () => {
    // dev-parity runs only for a product with a dev registration and a beta, so it is never on the placeholder.
    assert.ok(Array.isArray(portfolio.products) && portfolio.products.length === 1);
    const [p] = portfolio.products;
    assert.deepEqual(Object.keys(p).sort(), ['environment', 'manifest', 'name', 'repo', 'routines']);
    assert.equal(p.repo, '<owner>/<repo>');
    assert.equal(p.manifest, '.claude/shopify-app.json');
    assert.match(p.name, /^Example/);
    assert.match(p.environment, /^<.*>$/);
    for (const r of p.routines) assert.ok(files.includes(`${r}.md`), `routine ${r} does not exist`);
    assert.ok(p.routines.length >= 5);
    assert.ok(!p.routines.includes('dev-parity'), 'dev-parity is not on the placeholder roster');
  });
});

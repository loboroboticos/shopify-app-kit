// labels.json is the label set every consumer carries and scripts/sync-labels.mjs applies it: valid JSON, unique
// names, six-hex colors, exactly eight work-type labels, the executor ladder the file carries in `ladder` (with
// human:bootstrap alongside human:account), and a --dry-run that lists every label exactly once and never
// deletes. Zero dependencies (node:test); the script is never run against a real gh here.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { kitRoot } from './lib/fs.mjs';
import { run as spawn } from './lib/kit.mjs';

const labelsPath = path.join(kitRoot, 'labels.json');
const script = path.join(kitRoot, 'scripts', 'sync-labels.mjs');

const LADDER = ['code only', 'agent:ci', 'agent:cloud', 'agent:local', 'human:decision', 'human:account', 'human:legal'];
const WORK_TYPE = /^(code only|agent:[a-z]+|human:[a-z]+)$/;
const AGENT_COLORS = { 'agent:ci': 'bfd4f2', 'agent:cloud': '6fa8dc', 'agent:local': '1d5fa3' };
const HUMAN_COLORS = { 'human:bootstrap': 'fbca04', 'human:decision': 'e99695', 'human:account': 'd93f0b', 'human:legal': 'b60205' };

const doc = JSON.parse(fs.readFileSync(labelsPath, 'utf8'));
const labels = doc.labels;
const names = labels.map((l) => l.name);
const run = (args, opts = {}) => spawn(process.execPath, [script, ...args], opts);

describe('labels.json', () => {
  test('is an object with a ladder and a labels array of { name, color, description }', () => {
    assert.ok(Array.isArray(doc.ladder) && Array.isArray(labels));
    for (const l of labels) {
      assert.deepEqual(Object.keys(l).sort(), ['color', 'description', 'name'], JSON.stringify(l));
      assert.ok(l.name.trim().length > 0 && l.name === l.name.trim(), `name "${l.name}"`);
      assert.ok(l.description.length > 0 && l.description.length <= 100, `${l.name}: GitHub caps descriptions at 100 characters (${l.description.length})`);
    }
  });

  test('names are unique', () => assert.equal(new Set(names).size, names.length));

  test('every color is six lowercase hex digits without #', () => {
    for (const l of labels) assert.match(l.color, /^[0-9a-f]{6}$/, `${l.name}: ${l.color}`);
  });

  test('exactly eight work types: code only, three agent rungs, four human rungs', () => {
    const work = names.filter((n) => WORK_TYPE.test(n)).sort();
    assert.deepEqual(work, ['agent:ci', 'agent:cloud', 'agent:local', 'code only', 'human:account', 'human:bootstrap', 'human:decision', 'human:legal']);
  });

  test('the agent and human rungs carry the documented colors', () => {
    const color = Object.fromEntries(labels.map((l) => [l.name, l.color]));
    assert.equal(color['code only'], 'ededed');
    for (const [n, c] of Object.entries({ ...AGENT_COLORS, ...HUMAN_COLORS })) assert.equal(color[n], c, n);
  });

  test('the ladder is the executor order, every rung is a label, and human:bootstrap sits alongside human:account', () => {
    assert.deepEqual(doc.ladder, LADDER);
    for (const rung of doc.ladder) assert.ok(names.includes(rung), `ladder rung ${rung} is not a label`);
    assert.ok(!doc.ladder.includes('human:bootstrap'), 'human:bootstrap is not a rung of its own');
    assert.ok(names.includes('human:bootstrap'));
    const bootstrap = labels.find((l) => l.name === 'human:bootstrap');
    assert.match(bootstrap.description, /Unlocks/);
  });

  test('priorities, ROI buckets, gating and origin labels are present', () => {
    for (const n of ['p1', 'p2', 'p3', 'roi:5', 'roi:4', 'roi:3', 'roi:2', 'roi:1', 'launch-gate', 'blocked', 'deploy', 'qa', 'dependencies', 'bug', 'documentation']) {
      assert.ok(names.includes(n), n);
    }
    assert.equal(names.filter((n) => /^p[0-9]$/.test(n)).length, 3, 'three priorities');
    assert.equal(names.filter((n) => /^roi:[0-9]$/.test(n)).length, 5, 'five ROI buckets');
    assert.match(labels.find((l) => l.name === 'blocked').description, /after #N/);
  });
});

describe('scripts/sync-labels.mjs', () => {
  test('passes a syntax check and starts with a comment naming itself', () => {
    assert.equal(spawn(process.execPath, ['--check', script]).status, 0);
    const text = fs.readFileSync(script, 'utf8');
    assert.ok(text.slice(0, 600).includes('scripts/sync-labels.mjs'));
    assert.doesNotMatch(text, /^\s*import .* from ['"](?!node:)/m, 'imports only node: builtins');
  });

  test('--dry-run lists every label exactly once as a gh label create --force, deletes nothing', () => {
    const r = run(['--dry-run']);
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, labels.length);
    for (const l of labels) {
      const mine = lines.filter((line) => line.startsWith(`gh label create ${/^[A-Za-z0-9_./:=-]+$/.test(l.name) ? l.name : `'${l.name}'`} `));
      assert.equal(mine.length, 1, `${l.name}: ${mine.length} lines`);
      assert.ok(mine[0].includes(`--color ${l.color}`), mine[0]);
      assert.ok(mine[0].includes('--description '), mine[0]);
      assert.ok(mine[0].endsWith(' --force'), mine[0]);
    }
    assert.doesNotMatch(r.stdout, /label delete/);
    assert.doesNotMatch(r.stdout, /--repo/);
  });

  test('--repo <owner>/<repo> is appended to every command and validated', () => {
    const r = run(['--dry-run', '--repo', 'example-owner/example-repo']);
    assert.equal(r.status, 0, r.stderr);
    for (const line of r.stdout.trim().split('\n')) assert.ok(line.endsWith(' --force --repo example-owner/example-repo'), line);
    const bad = run(['--dry-run', '--repo', 'not-a-repo']);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /--repo must be <owner>\/<repo>/);
  });

  test('--file reads another labels file, a bare array included, and rejects a bad color', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-labels-'));
    const alt = path.join(tmp, 'labels.json');
    fs.writeFileSync(alt, JSON.stringify([{ name: 'x y', color: 'ABCDEF', description: "it's one" }]));
    const r = run(['--dry-run', '--file', alt]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), "gh label create 'x y' --color abcdef --description 'it'\\''s one' --force");
    fs.writeFileSync(alt, JSON.stringify({ labels: [{ name: 'x', color: 'red', description: '' }] }));
    const bad = run(['--dry-run', '--file', alt]);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /six-hex color/);
  });

  test('a real run reports a failed gh call and exits 1 without deleting anything', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-labels-gh-'));
    // A fake gh that records its arguments and fails on one label.
    const log = path.join(tmp, 'calls.log');
    fs.writeFileSync(path.join(tmp, 'gh'), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${log}"\ncase " $* " in *' create p2 '*) echo 'HTTP 403' >&2; exit 1 ;; esac\nexit 0\n`, { mode: 0o755 });
    const r = run([], { env: { ...process.env, PATH: `${tmp}${path.delimiter}${process.env.PATH}` } });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /sync-labels: failed: gh label create p2 /);
    assert.match(r.stdout, new RegExp(`sync-labels: ${labels.length - 1} of ${labels.length} labels created or updated; nothing deleted`));
    const calls = fs.readFileSync(log, 'utf8').trim().split('\n');
    assert.equal(calls.length, labels.length);
    for (const c of calls) { assert.match(c, /^label create /); assert.match(c, / --force$/); }
    assert.ok(!calls.some((c) => c.includes('delete')));
  });
});

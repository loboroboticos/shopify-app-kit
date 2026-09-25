// Prose that enumerates something the tree already defines (the shipped guards, the routines, the review
// rosters, the release dimensions, the dedupe constants, the label set, the version-bump directories, the graphify
// pin) is checked here against its source, so a list in the README or a SKILL.md cannot drift from the code it
// describes. When one of these fails, fix the prose; the source is the source.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kitRoot, read } from './lib/fs.mjs';

const readme = read('README.md');
const ticks = (text) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
const region = (text, from, to) => {
  const i = text.indexOf(from);
  assert.ok(i >= 0, `marker not found: ${from}`);
  const j = to ? text.indexOf(to, i + from.length) : -1;
  return text.slice(i, j < 0 ? undefined : j);
};
const bullet = (text, marker) => region(text, marker, '\n- **');
const uniq = (a) => [...new Set(a)].sort();

// The sources.
const guards = fs.readdirSync(path.join(kitRoot, 'hooks')).filter((n) => /^guard-.*\.sh$/.test(n)).sort();
const routines = fs.readdirSync(path.join(kitRoot, 'routines')).filter((n) => n.endsWith('.md') && n !== 'REGISTRY.md').map((n) => n.slice(0, -3)).sort();
const prePr = read('workflows', 'pre-pr-review.js');
const plan = read('workflows', 'plan-review.js');
const release = read('workflows', 'release-readiness.js');
const diffRoster = uniq([...prePr.matchAll(/\{ name: '([a-z-]+)', when:/g)].map((m) => m[1]));
const planRoster = uniq([...plan.matchAll(/\{ name: '([a-z-]+)' \}/g)].map((m) => m[1]));
const dimensions = uniq([...release.matchAll(/dimension: '([a-z-]+)'/g)].map((m) => m[1]));
const LINE_FUZZ = Number(prePr.match(/^const LINE_FUZZ = (\d+)/m)[1]);
const VERIFY_CAP = Number(prePr.match(/^const VERIFY_CAP = (\d+)/m)[1]);
const labels = JSON.parse(read('labels.json')).labels.map((l) => l.name);
const bumpDirs = uniq(read('.github', 'workflows', 'ci.yml').match(/--\s+((?:[a-z.-]+\s+)+)\|\| true/)[1].trim().split(/\s+/));
const GRAPHIFY_VERSION = read('hooks', 'doctor.sh').match(/^GRAPHIFY_VERSION="([^"]+)"$/m)[1];
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

describe('docs mirror their sources', () => {
  test('the README "What you get" table lists exactly the shipped guards', () => {
    assert.deepEqual(uniq([...readme.matchAll(/^\| `hooks\/(guard-[a-z-]+\.sh)`/gm)].map((m) => m[1])), guards);
  });

  test('the sync snippet registers exactly the shipped guards, and no skill enumerates them elsewhere', () => {
    const sync = read('skills', 'sync', 'SKILL.md');
    assert.deepEqual(uniq([...sync.matchAll(/hooks\/kit\/(guard-[a-z-]+\.sh)/g)].map((m) => m[1])), guards);
    assert.doesNotMatch(read('skills', 'doctor', 'SKILL.md'), /guard-[a-z]+(-[a-z]+)*\.sh/, 'doctor/SKILL.md names guards by the glob, never by name');
  });

  test('both README routine lists name exactly the routines', () => {
    const row = readme.split('\n').find((l) => l.startsWith('| `routines/` |'));
    assert.ok(row, 'the routines/ row');
    assert.deepEqual(uniq(ticks(row).filter((t) => /^[a-z]+(-[a-z]+)*$/.test(t))), routines);
    const b = bullet(readme, '- **`routines/`**');
    assert.deepEqual(uniq([...b.matchAll(/`([a-z-]+)`\s+\(/g)].map((m) => m[1])), routines);
  });

  test('the README review roster bullets name exactly the workflow rosters', () => {
    const agentLike = (t) => /^[a-z]+(-[a-z]+)+$/.test(t);
    assert.deepEqual(uniq(ticks(bullet(readme, '- **Before a PR, on a diff:**')).filter(agentLike)), diffRoster);
    assert.deepEqual(uniq(ticks(bullet(readme, '- **Before building, on a plan:**')).filter(agentLike)), planRoster);
  });

  test('the README release-readiness paragraph enumerates exactly the dimensions', () => {
    const r = region(readme, '### The release-readiness and plan-review workflows', '`/shopify-app-kit:plan-review <plan file');
    assert.deepEqual(uniq([...r.matchAll(/`([a-z-]+)`\s+\(/g)].map((m) => m[1])), dimensions);
    const row = readme.split('\n').find((l) => l.startsWith('| `/shopify-app-kit:release-readiness`'));
    for (const d of dimensions) assert.ok(ticks(row).includes(d), `the release-readiness row names \`${d}\``);
  });

  test('the README states the dedupe window and the skeptic cap as the workflows define them', () => {
    assert.ok(readme.includes(`within ${WORDS[LINE_FUZZ]} lines`), `README says "within ${WORDS[LINE_FUZZ]} lines" (LINE_FUZZ = ${LINE_FUZZ})`);
    assert.ok(readme.includes(`up to ${WORDS[VERIFY_CAP]}`), `README says "up to ${WORDS[VERIFY_CAP]}" (VERIFY_CAP = ${VERIFY_CAP})`);
  });

  test('the README labels bullet and the triage prompt name only labels that exist, and the bullet names them all', () => {
    const named = ticks(bullet(readme, '- **`labels.json`**'));
    for (const l of labels) {
      const covered = named.includes(l) || (/^roi:\d$/.test(l) && named.includes('roi:5') && named.includes('roi:1'));
      assert.ok(covered, `README labels bullet names \`${l}\``);
    }
    const labelLike = (t) => t === 'code only' || /^[a-z]+:[a-z0-9]+$/.test(t) || /^p\d$/.test(t);
    for (const t of named.filter(labelLike)) assert.ok(labels.includes(t), `README names a label that does not exist: ${t}`);
    for (const t of ticks(read('routines', 'triage.md')).filter(labelLike)) assert.ok(labels.includes(t), `triage.md names a label that does not exist: ${t}`);
  });

  test('every version-bump sentence lists exactly the directories CI watches', () => {
    for (const [file, from, to] of [['README.md', 'Any change under', 'version bump'], ['.claude/rules/kit.md', 'Every change under', 'bumps the version'], ['skills/kit-dev/SKILL.md', 'Any change under', 'bumps the version']]) {
      const dirs = uniq(ticks(region(read(file), from, to)).filter((t) => t.endsWith('/')).map((t) => t.slice(0, -1)));
      assert.deepEqual(dirs, bumpDirs, `${file}: the version-bump directories`);
    }
  });

  test('every graphify pin in the README is the doctor\'s', () => {
    const pins = [...readme.matchAll(/graphifyy==([0-9.]+)/g)].map((m) => m[1]);
    assert.ok(pins.length > 0, 'the README names the pinned graphify install');
    for (const p of pins) assert.equal(p, GRAPHIFY_VERSION);
  });

  test('every doc that lists the validate commands lists exactly the ones CI runs', () => {
    const ci = uniq([...read('.github', 'workflows', 'ci.yml').matchAll(/^\s+(claude plugin validate [^\n]+)$/gm)].map((m) => m[1].trim()));
    assert.ok(ci.length > 0, 'ci.yml runs claude plugin validate');
    for (const file of ['README.md', 'skills/kit-dev/SKILL.md', '.claude/rules/kit.md']) {
      const listed = uniq([...read(file).matchAll(/^(claude plugin validate [^\n]+)$/gm)].map((m) => m[1].trim()));
      assert.deepEqual(listed, ci, `${file}: the validate commands`);
    }
  });

  test('the release skill does not carry a hand-written copy of the workflow\'s checklist', () => {
    assert.doesNotMatch(read('skills', 'release', 'SKILL.md'), /- \[ \] CI green/, 'the checklist lives in workflows/release-readiness.js only');
  });
});

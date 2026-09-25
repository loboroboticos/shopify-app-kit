// test/budget.json is the kit's size budget: a ceiling per top-level directory, per named root file and per file
// class (a SKILL.md, a reference, an agent, a routine), in lines as wc -l counts them. Ceilings only ratchet down
// freely; raising one sets `raisedIn` to the version doing it, and that version's CHANGELOG section must carry a
// `### Budget` line saying which consumer need paid for the room. The headroom per directory is printed as a
// diagnostic so a maintainer (or the kit-tidy routine) sees the trend without computing it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kitRoot, walk, read } from './lib/fs.mjs';
import { KIT_VERSION } from './lib/kit.mjs';

const budget = JSON.parse(read('test', 'budget.json'));
const lines = (file) => (fs.readFileSync(file, 'utf8').match(/\n/g) ?? []).length;
const dirLines = (dir) => [...walk(path.join(kitRoot, dir))].reduce((n, f) => n + lines(f), 0);
const semver = (v) => v.split('.').map(Number);
const notAfter = (a, b) => { const [x, y] = [semver(a), semver(b)]; for (let i = 0; i < 3; i++) { if (x[i] !== y[i]) return x[i] < y[i]; } return true; };

const CLASSES = {
  skill: () => fs.readdirSync(path.join(kitRoot, 'skills')).map((s) => `skills/${s}/SKILL.md`),
  reference: () => fs.readdirSync(path.join(kitRoot, 'skills')).flatMap((s) => {
    const d = path.join(kitRoot, 'skills', s, 'references');
    return fs.existsSync(d) ? fs.readdirSync(d).map((f) => `skills/${s}/references/${f}`) : [];
  }),
  agent: () => fs.readdirSync(path.join(kitRoot, 'agents')).map((f) => `agents/${f}`),
  routine: () => fs.readdirSync(path.join(kitRoot, 'routines')).filter((f) => f !== 'REGISTRY.md').map((f) => `routines/${f}`),
};

describe('size budget', () => {
  test('every directory is within its ceiling', (t) => {
    for (const [dir, cap] of Object.entries(budget.dirs)) {
      const n = dirLines(dir);
      t.diagnostic(`${dir}: ${n} of ${cap} lines (${cap - n} headroom)`);
      assert.ok(n <= cap, `${dir}/ is ${n} lines, over its ceiling of ${cap}; remove something, or raise the ceiling in test/budget.json with a ### Budget line in the CHANGELOG`);
    }
  });

  test('every named file is within its ceiling', () => {
    for (const [file, cap] of Object.entries(budget.files)) {
      const n = lines(path.join(kitRoot, file));
      assert.ok(n <= cap, `${file} is ${n} lines, over its ceiling of ${cap}`);
    }
  });

  for (const [cls, cap] of Object.entries(budget.classes)) {
    test(`every ${cls} is within ${cap} lines`, () => {
      assert.ok(cls in CLASSES, `unknown file class ${cls}`);
      for (const f of CLASSES[cls]()) {
        const n = lines(path.join(kitRoot, f));
        assert.ok(n <= cap, `${f} is ${n} lines, over the ${cls} ceiling of ${cap}`);
      }
    });
  }

  test('a raised ceiling is explained in the CHANGELOG section of the version that raised it', () => {
    assert.match(budget.raisedIn, /^\d+\.\d+\.\d+$/, 'raisedIn is a version');
    assert.ok(notAfter(budget.raisedIn, KIT_VERSION), `raisedIn ${budget.raisedIn} is after the plugin version ${KIT_VERSION}`);
    const changelog = read('CHANGELOG.md');
    const start = changelog.indexOf(`\n## ${budget.raisedIn}\n`);
    assert.ok(start >= 0, `CHANGELOG.md has no ## ${budget.raisedIn} section`);
    const end = changelog.indexOf('\n## ', start + 1);
    const section = changelog.slice(start, end < 0 ? undefined : end);
    assert.match(section, /^### Budget\b/m, `the ## ${budget.raisedIn} CHANGELOG section needs a "### Budget" line explaining the ceilings it raised`);
  });
});

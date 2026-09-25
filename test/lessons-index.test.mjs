// lessons/INDEX.md is a catalogue, never a second owner: every row's home must be a real file with a matching
// heading anchor, classes and sources come from lessons/README.md's closed sets, ids are unique, and every
// skill reference file is the home of at least one row (a reference nobody indexed is a lesson nobody finds).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kitRoot } from './lib/fs.mjs';

const indexPath = path.join(kitRoot, 'lessons', 'INDEX.md');
const readmePath = path.join(kitRoot, 'lessons', 'README.md');

const CLASSES = new Set(['rule', 'recipe', 'lens', 'adr-seed']);
const SOURCES = new Set(['app-1', 'app-2', 'app-3']);
const HOME = /^(skills\/[a-z-]+\/references\/[a-z-]+\.md|agents\/[a-z-]+\.md)#([a-z0-9_-]+)$/;

// GitHub-style heading anchor: lowercase, drop everything but word characters, spaces and hyphens, spaces to hyphens.
function anchor(heading) {
  return heading.trim().toLowerCase().replace(/[^\w\- ]/g, '').replace(/ /g, '-');
}

function headings(file) {
  const text = fs.readFileSync(path.join(kitRoot, file), 'utf8');
  return new Set(text.split(/\r?\n/).filter((l) => /^#{1,6} /.test(l)).map((l) => anchor(l.replace(/^#+ /, ''))));
}

function rows() {
  const lines = fs.readFileSync(indexPath, 'utf8').split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 5 || cells[0] === 'id' || /^-+$/.test(cells[0])) continue;
    const [id, rule, cls, home, source] = cells;
    out.push({ id, rule, cls, home, source });
  }
  return out;
}

describe('lessons index', () => {
  test('lessons/README.md and lessons/INDEX.md exist', () => {
    assert.ok(fs.existsSync(readmePath), 'lessons/README.md');
    assert.ok(fs.existsSync(indexPath), 'lessons/INDEX.md');
  });

  const all = rows();
  test('the table has a sensible number of rows', () => assert.ok(all.length >= 35 && all.length <= 200, `${all.length} rows`));

  test('ids are unique and prefixed', () => {
    const seen = new Set();
    for (const r of all) {
      assert.match(r.id, /^[a-z]+-\d+$/, `id ${r.id} is <prefix>-<n>`);
      assert.ok(!seen.has(r.id), `duplicate id ${r.id}`);
      seen.add(r.id);
    }
  });

  const cache = new Map();
  for (const r of all) {
    test(`lesson ${r.id}`, () => {
      assert.ok(r.rule.length > 0 && r.rule.length <= 160, `${r.id}: rule is one line (${r.rule.length} chars)`);
      assert.ok(CLASSES.has(r.cls), `${r.id}: class ${r.cls} not in ${[...CLASSES].join('|')}`);
      const m = r.home.match(HOME);
      assert.ok(m, `${r.id}: home must be skills/<skill>/references/<file>.md#anchor or agents/<agent>.md#anchor, got ${r.home}`);
      const [, file, anchorName] = m;
      assert.ok(fs.existsSync(path.join(kitRoot, file)), `${r.id}: home file ${file} does not exist`);
      if (!cache.has(file)) cache.set(file, headings(file));
      assert.ok(cache.get(file).has(anchorName), `${r.id}: no heading with anchor #${anchorName} in ${file}; headings: ${[...cache.get(file)].join(', ')}`);
      const labels = r.source.split(',').map((s) => s.trim());
      assert.ok(labels.length > 0, `${r.id}: at least one source`);
      for (const l of labels) assert.ok(SOURCES.has(l), `${r.id}: source ${l} is not one of ${[...SOURCES].join('|')}`);
      if (r.cls === 'lens') assert.match(file, /^agents\//, `${r.id}: a lens lives in a review agent`);
      else assert.match(file, /^skills\//, `${r.id}: a ${r.cls} lives in a skill reference`);
    });
  }

  test('every skill reference file is the home of at least one lesson', () => {
    const homes = new Set(all.map((r) => r.home.split('#')[0]));
    const skillsDir = path.join(kitRoot, 'skills');
    const missing = [];
    for (const skill of fs.readdirSync(skillsDir)) {
      const refs = path.join(skillsDir, skill, 'references');
      if (!fs.existsSync(refs)) continue;
      for (const f of fs.readdirSync(refs)) {
        const rel = `skills/${skill}/references/${f}`;
        if (!homes.has(rel)) missing.push(rel);
      }
    }
    assert.deepEqual(missing, [], `add a row to lessons/INDEX.md for each of:\n${missing.join('\n')}`);
  });

  test('the history section exists', () => {
    assert.match(fs.readFileSync(indexPath, 'utf8'), /^## History/m, 'INDEX.md keeps a ## History section for superseded lessons');
  });
});

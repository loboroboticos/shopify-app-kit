// lessons/INDEX.md is a catalogue, never a second owner: every live row's home must be a real file with a matching
// heading anchor, classes and sources come from lessons/README.md's closed sets, ids are unique, and every live
// row is cited by id from something a session reads (a SKILL.md, an agent, a template rule seed, a workflow, a
// routine prompt): a row nothing pulls on is a catalogue entry nobody finds, and belongs in the History section.
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

// Live rows have five cells and sit above ## History; History rows carry a sixth cell, the reason.
function parse() {
  const text = fs.readFileSync(indexPath, 'utf8');
  const at = text.indexOf('\n## History');
  const table = (chunk, width) => {
    const out = [];
    for (const line of chunk.split(/\r?\n/)) {
      if (!line.startsWith('|')) continue;
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells.length !== width || cells[0] === 'id' || /^-+$/.test(cells[0])) continue;
      const [id, rule, cls, home, source, reason] = cells;
      out.push({ id, rule, cls, home, source, reason });
    }
    return out;
  };
  return { live: table(at < 0 ? text : text.slice(0, at), 5), history: at < 0 ? [] : table(text.slice(at), 6) };
}
const rows = () => parse().live;

// Where a citation counts: what a session reads. References are homes, not citers; README and CHANGELOG are prose.
const CITING = ['skills/*/SKILL.md', 'agents/*.md', 'templates/.claude/rules/*.md', 'workflows/*.js', 'routines/*.md'];
function citingTexts() {
  const out = [];
  for (const pattern of CITING) {
    const [dir, ...rest] = pattern.split('/*');
    const walk = (d, parts) => {
      if (!fs.existsSync(d)) return;
      for (const e of fs.readdirSync(d)) {
        const p = path.join(d, e);
        if (parts.length === 0) { if (fs.statSync(p).isFile()) out.push({ file: path.relative(kitRoot, p), text: fs.readFileSync(p, 'utf8') }); continue; }
        const [head, ...tail] = parts;
        if (fs.statSync(p).isDirectory()) { if (tail.length) walk(p, tail); else if (fs.existsSync(path.join(p, head))) out.push({ file: path.relative(kitRoot, path.join(p, head)), text: fs.readFileSync(path.join(p, head), 'utf8') }); }
        else if (parts.length === 1 && e.endsWith(head)) out.push({ file: path.relative(kitRoot, p), text: fs.readFileSync(p, 'utf8') });
      }
    };
    walk(path.join(kitRoot, dir), rest.map((r) => r.replace(/^\//, '')));
  }
  return out;
}

describe('lessons index', () => {
  test('lessons/README.md and lessons/INDEX.md exist', () => {
    assert.ok(fs.existsSync(readmePath), 'lessons/README.md');
    assert.ok(fs.existsSync(indexPath), 'lessons/INDEX.md');
  });

  const all = rows();
  test('the live table is bounded', () => assert.ok(all.length <= 200, `${all.length} rows`));

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

  test('every live row is cited by id from something a session reads', () => {
    const texts = citingTexts();
    assert.ok(texts.length > 0, 'citing artifacts exist');
    const uncited = [];
    for (const r of all) {
      const re = new RegExp(`(?<![A-Za-z0-9-])${r.id}(?![A-Za-z0-9-])`);
      if (!texts.some((t) => re.test(t.text))) uncited.push(r.id);
    }
    assert.deepEqual(uncited, [], `move each of these to ## History with the reason "uncited", or cite it by id from a SKILL.md, agent, rule seed, workflow or routine:\n${uncited.join('\n')}`);
  });

  test('history rows are dated, carry a reason, and are never also live', () => {
    const { history } = parse();
    const live = new Set(all.map((r) => r.id));
    const text = fs.readFileSync(indexPath, 'utf8');
    for (const h of history) {
      assert.ok(h.reason && h.reason.length > 0, `${h.id}: history row has a reason`);
      assert.ok(!live.has(h.id), `${h.id} is both live and in History`);
    }
    if (history.length) assert.match(text.slice(text.indexOf('\n## History')), /^### \d{4}-\d{2}-\d{2} /m, 'History rows sit under a dated subsection');
  });

  test('the history section exists', () => {
    assert.match(fs.readFileSync(indexPath, 'utf8'), /^## History/m, 'INDEX.md keeps a ## History section for superseded lessons');
  });
});

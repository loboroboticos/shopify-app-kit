// test/docs-consistency.test.mjs (shopify-app-kit template)
// Keeps the docs map honest. Reads docs.mapFile, docs.mapHeading and docs.adrDir from .claude/shopify-app.json.
// Fails when a file under docs/ is missing from the map, when a path the map names does not exist, when a
// reference doc carries a dated heading (dates belong in docs/history/ or a date-named planning file), and
// when an ADR file has no row in the ADR index. The allowlists only shrink: a second test fails when an entry
// no longer needs to be there. Every failure message names the repair.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'shopify-app.json'), 'utf8'));
const docs = manifest.docs ?? {};
const MAP_FILE = docs.mapFile ?? 'README.md';
const MAP_HEADING = docs.mapHeading ?? '## Docs map';
const ADR_DIR = docs.adrDir ?? 'docs/adr';
const DOCS_DIR = 'docs';
const HISTORY_DIR = 'docs/history';

// Known debt. Entries leave when the debt is paid; the "only shrinks" test below enforces it.
// A file under docs/ that the map does not name yet.
const KNOWN_UNMAPPED = [];
// A reference doc that still carries a dated heading.
const KNOWN_DATED_HEADINGS = [];

// A heading that carries a date: "## 2026-08 outage", "### Decided 2026-08-14", "## August 2026 plan".
const DATED_HEADING = /^#{1,6} .*\b(20\d\d-\d\d(-\d\d)?|(January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d)\b/;

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile() && entry.name.endsWith('.md')) yield path.relative(root, p).split(path.sep).join('/');
  }
}

function mapSection() {
  const file = path.join(root, MAP_FILE);
  assert.ok(fs.existsSync(file), `${MAP_FILE} does not exist; create it with a "${MAP_HEADING}" section or point docs.mapFile in .claude/shopify-app.json at the file that carries the docs map`);
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === MAP_HEADING);
  assert.ok(start !== -1, `${MAP_FILE} has no "${MAP_HEADING}" heading; add the docs map section (templates/docs/README-docs-map.md has the shape) or fix docs.mapHeading`);
  const level = MAP_HEADING.match(/^#+/)[0].length;
  const end = lines.findIndex((l, i) => i > start && /^#{1,6} /.test(l) && l.match(/^#+/)[0].length <= level);
  return lines.slice(start + 1, end === -1 ? undefined : end).join('\n');
}

const isAdrRecord = (f) => f.startsWith(`${ADR_DIR}/`) && /\/\d{4}-[a-z0-9-]+\.md$/.test(f);
const isHistory = (f) => f.startsWith(`${HISTORY_DIR}/`);

describe('docs map', () => {
  const section = mapSection();
  // The first cell of each table row names the document (a file, or a directory ending in /); globs are prose.
  const named = section.split(/\r?\n/).filter((l) => l.startsWith('| `')).map((l) => l.match(/^\| `([^`]+)`/)[1]).filter((f) => !f.includes('*'));

  test('every file under docs/ has a row in the map', () => {
    const missing = [];
    for (const f of walk(path.join(root, DOCS_DIR))) {
      if (isAdrRecord(f) || isHistory(f) || KNOWN_UNMAPPED.includes(f)) continue;
      if (!named.includes(f)) missing.push(f);
    }
    assert.deepEqual(missing, [], `add a row to the "${MAP_HEADING}" table in ${MAP_FILE} for each of:\n${missing.map((f) => `  | \`${f}\` | <what it owns> | reference |`).join('\n')}`);
  });

  test('every path the map names exists', () => {
    const gone = named.filter((f) => !fs.existsSync(path.join(root, f)));
    assert.deepEqual(gone, [], `remove these rows from the "${MAP_HEADING}" table in ${MAP_FILE}, or create the file:\n  ${gone.join('\n  ')}`);
  });

  test('reference docs carry no dated headings', () => {
    const hits = [];
    for (const f of walk(path.join(root, DOCS_DIR))) {
      if (isAdrRecord(f) || isHistory(f) || KNOWN_DATED_HEADINGS.includes(f)) continue;
      const lines = fs.readFileSync(path.join(root, f), 'utf8').split(/\r?\n/);
      lines.forEach((l, i) => { if (DATED_HEADING.test(l)) hits.push(`${f}:${i + 1} ${l}`); });
    }
    assert.deepEqual(hits, [], `a reference doc states the current rule and carries no date; move the dated text to ${HISTORY_DIR}/<YYYY-MM>-<topic>.md (or a date-named planning file) and leave a link:\n  ${hits.join('\n  ')}`);
  });

  test('every ADR record has a row in the ADR index', () => {
    const index = path.join(root, ADR_DIR, 'README.md');
    if (!fs.existsSync(index)) return;
    const text = fs.readFileSync(index, 'utf8');
    const missing = [...walk(path.join(root, ADR_DIR))].filter((f) => isAdrRecord(f) && !/\/0000-template\.md$/.test(f) && !text.includes(path.basename(f)));
    assert.deepEqual(missing, [], `add a row to ${ADR_DIR}/README.md (number, title, status, date) for each of:\n  ${missing.join('\n  ')}`);
  });

  test('the allowlists only shrink', () => {
    const stale = [];
    for (const f of KNOWN_UNMAPPED) if (!fs.existsSync(path.join(root, f)) || named.includes(f)) stale.push(`KNOWN_UNMAPPED: ${f}`);
    for (const f of KNOWN_DATED_HEADINGS) {
      const ok = fs.existsSync(path.join(root, f)) && fs.readFileSync(path.join(root, f), 'utf8').split(/\r?\n/).some((l) => DATED_HEADING.test(l));
      if (!ok) stale.push(`KNOWN_DATED_HEADINGS: ${f}`);
    }
    assert.deepEqual(stale, [], `these allowlist entries no longer match a problem; remove them from test/docs-consistency.test.mjs:\n  ${stale.join('\n  ')}`);
  });
});

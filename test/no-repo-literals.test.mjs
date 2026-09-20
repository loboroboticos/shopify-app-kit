// The kit is generic developer tooling. Nothing repo-specific (store handles, app client ids, hosting app names,
// business or product names, real workflow ids) may land here. Fixtures use invented names.
// Scans every file in the repo (excluding node_modules, .git and this test, which must spell the terms out).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, '..');
const self = fileURLToPath(import.meta.url);

const FORBIDDEN = [
  'myshopify.com',
  'mixandmatchmore',
  'mix-match-more',
  'set-builder',
  'setbuilder',
  'piecework',
  'ysw',
  'yasmin',
  'yasmín',
  'fly.dev',
  'ab8b4392',
  'd75996cc',
  'ef41544f',
  'loboroberto',
];

const SKIP_DIRS = new Set(['node_modules', '.git']);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(p);
    } else if (entry.isFile()) {
      yield p;
    }
  }
}

test('no repo-specific literals anywhere in the kit', () => {
  const hits = [];
  for (const file of walk(kitRoot)) {
    if (file === self) continue;
    const text = fs.readFileSync(file, 'utf8').normalize('NFC').toLowerCase();
    for (const term of FORBIDDEN) {
      const needle = term.normalize('NFC').toLowerCase();
      let idx = text.indexOf(needle);
      while (idx !== -1) {
        const line = text.slice(0, idx).split('\n').length;
        hits.push(`${path.relative(kitRoot, file)}:${line} contains "${term}"`);
        idx = text.indexOf(needle, idx + needle.length);
      }
    }
  }
  assert.deepEqual(hits, [], `repo-specific literals found:\n${hits.join('\n')}`);
});

test('the fixtures use invented names', () => {
  const dir = path.join(here, 'fixtures', 'manifests');
  for (const f of fs.readdirSync(dir)) {
    const m = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const handle of Object.values(m.app.handles ?? {})) assert.match(handle, /^(example|sample)/, `${f} handle ${handle}`);
  }
});

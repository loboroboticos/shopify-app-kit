// The kit is generic developer tooling. Nothing repo-specific (store handles, app client ids, hosting app names,
// business or product names, real workflow ids) may land here. Fixtures use invented names.
// Scans every file in the repo (excluding node_modules, .git and this test). Private names are matched by hash
// so the kit's public source never spells them out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, '..');
const self = fileURLToPath(import.meta.url);

// Generic hosts that betray a real store or deployment, spelled out.
const FORBIDDEN = ['myshopify.com', 'fly.dev'];

// Private product, owner and id terms, kept as [length, first 16 hex of sha256(NFC lowercase term)] so this
// public test never names them. To add one: node -e "console.log(require('crypto').createHash('sha256')
// .update('<term>'.normalize('NFC').toLowerCase()).digest('hex').slice(0, 16))" and its length.
const FORBIDDEN_HASHED = [
  [15, 'abc7e65fc267770b'],
  [14, '359a6ba21b793fe0'],
  [11, '0402b16e21ec6ae2'],
  [10, 'e3e6abdc7ec7fd23'],
  [9, '680789d1fdf08148'],
  [3, 'e0a66dd065522cf4'],
  [6, 'd5e7d945ccf8829e'],
  [6, '1f9fc9efc1f5462e'],
  [8, '0bb865860b1f3e5a'],
  [8, 'edb55bba993bd616'],
  [8, '294555a37002060d'],
  [11, '09049c4615162561'],
];
const HASHES = new Set(FORBIDDEN_HASHED.map(([, h]) => h));
const LENGTHS = [...new Set(FORBIDDEN_HASHED.map(([n]) => n))];
// Every hashed term is made of these characters, so only runs of them are windowed.
const RUN = /[a-z0-9\u00c0-\u024f.-]+/g;
const digest = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

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
    for (const m of text.matchAll(RUN)) {
      const run = m[0];
      for (const n of LENGTHS) {
        for (let i = 0; i + n <= run.length; i++) {
          const h = digest(run.slice(i, i + n));
          if (HASHES.has(h)) hits.push(`${path.relative(kitRoot, file)}:${text.slice(0, m.index + i).split('\n').length} contains a private term (hash ${h})`);
        }
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

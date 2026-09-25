// The three workflow scripts cannot share code (the loader forbids imports), so the blocks they share are marked
// `// @shared <name>` … `// @end` in each file and this test keeps every copy byte-identical: a change to one
// that misses the others fails here with the first differing line, instead of forking silently. Per-workflow
// behaviour goes through the parameters each script declares just above its dedupe block
// (TOPIC_NEEDS_SAME_CLAIM, mergeExtra, newExtra), never through an edit inside a block.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kitRoot } from './lib/fs.mjs';

const workflowsDir = path.join(kitRoot, 'workflows');
const files = fs.readdirSync(workflowsDir).filter((n) => n.endsWith('.js')).sort();

// Every workflow carries each of these once.
const EXPECTED = ['constants', 'findings-schema', 'verdict-schema', 'dedupe', 'skeptic-apply', 'verdict-counts'];
// The one declared difference: plan-review's finding shape carries an optional adr tag.
const EXCEPTIONS = { 'findings-schema': { 'plan-review.js': [/^\s*adr: \{ type: 'boolean' \},$/] } };
// The names the dedupe block reads and each workflow must declare outside any block.
const PARAMETERS = ['TOPIC_NEEDS_SAME_CLAIM', 'mergeExtra', 'newExtra'];

function blocks(text, file) {
  const out = {};
  const lines = text.split('\n');
  let open = null;
  for (let i = 0; i < lines.length; i++) {
    const start = lines[i].match(/^\/\/ @shared ([a-z-]+)$/);
    if (start) {
      assert.equal(open, null, `${file}:${i + 1}: @shared ${start[1]} opened inside @shared ${open?.name}`);
      open = { name: start[1], from: i + 1 };
      continue;
    }
    if (lines[i] === '// @end') {
      assert.ok(open, `${file}:${i + 1}: @end without @shared`);
      assert.ok(!(open.name in out), `${file}: @shared ${open.name} appears twice`);
      out[open.name] = { body: lines.slice(open.from, i), line: open.from + 1 };
      open = null;
    }
  }
  assert.equal(open, null, `${file}: @shared ${open?.name} never closed`);
  return out;
}

const normalise = (name, file, body) => body.filter((l) => !(EXCEPTIONS[name]?.[file] ?? []).some((re) => re.test(l)));

describe('workflows shared blocks', () => {
  const parsed = Object.fromEntries(files.map((f) => [f, blocks(fs.readFileSync(path.join(workflowsDir, f), 'utf8'), f)]));

  test('every workflow carries every shared block', () => {
    for (const f of files) assert.deepEqual(Object.keys(parsed[f]).sort(), [...EXPECTED].sort(), f);
  });

  for (const name of EXPECTED) {
    test(`@shared ${name} is identical across the workflows`, () => {
      const [first, ...rest] = files;
      const ref = normalise(name, first, parsed[first][name].body);
      for (const f of rest) {
        const got = normalise(name, f, parsed[f][name].body);
        const n = Math.max(ref.length, got.length);
        for (let i = 0; i < n; i++) {
          assert.equal(got[i], ref[i], `@shared ${name}: ${f}:${parsed[f][name].line + i} differs from ${first}:${parsed[first][name].line + i}\n  ${first}: ${ref[i]}\n  ${f}: ${got[i]}`);
        }
      }
    });
  }

  test('the dedupe parameters are declared by each workflow outside the shared blocks', () => {
    for (const f of files) {
      const text = fs.readFileSync(path.join(workflowsDir, f), 'utf8');
      const inside = Object.values(parsed[f]).flatMap((b) => b.body).join('\n');
      for (const p of PARAMETERS) {
        assert.match(text, new RegExp(`^const ${p} = `, 'm'), `${f} declares ${p}`);
        assert.doesNotMatch(inside, new RegExp(`^const ${p} = `, 'm'), `${f}: ${p} is declared inside a shared block`);
        assert.match(parsed[f].dedupe.body.join('\n'), new RegExp(`\\b${p}\\b`), `the dedupe block reads ${p}`);
      }
    }
  });
});

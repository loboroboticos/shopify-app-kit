// Every workflows/*.js: a plain-JavaScript Workflow script Claude Code loads from the plugin (only `.js` is
// loaded; `.mjs`, `.cjs` and `.ts` are skipped as near misses). The first statement is a pure-literal
// `export const meta = {...}` whose name matches the file name, whose whenToUse says "Use when", and whose phase
// titles match the phase() calls in the body. Every `shopify-app-kit:<agent>` it launches exists under agents/,
// the script parses as a workflow body (an async function: top-level await and return are allowed, as the
// runtime allows them), and it avoids the calls the Workflow runtime forbids.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, '..');
const workflowsDir = path.join(kitRoot, 'workflows');
const agentsDir = path.join(kitRoot, 'agents');

const MAX_BYTES = 524288; // the loader's per-file limit
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const META_KEYS = new Set(['name', 'description', 'whenToUse', 'phases']);
// The runtime throws on these (they would break resume); Node APIs are not available at all.
const FORBIDDEN = [/\bDate\.now\s*\(/, /\bMath\.random\s*\(/, /\bnew\s+Date\s*\(\s*\)/, /\brequire\s*\(/, /^\s*import\s/m, /\bprocess\./];

// The meta literal: from `export const meta = {` to its matching brace.
function metaLiteral(text) {
  const start = text.indexOf('export const meta = {');
  assert.equal(start, 0, 'the script starts with `export const meta = {` (the loader requires it to be the first statement)');
  let depth = 0;
  let i = text.indexOf('{', start);
  for (; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) break; }
  }
  return { literal: text.slice(text.indexOf('{', start), i + 1), body: text.slice(i + 1) };
}

describe('workflows parity', () => {
  const entries = fs.existsSync(workflowsDir) ? fs.readdirSync(workflowsDir) : [];
  test('there is at least one workflow', () => assert.ok(entries.length > 0));
  test('every entry is a .js file (the loader skips .mjs, .cjs and .ts)', () => {
    for (const e of entries) assert.match(e, /^[a-z0-9-]+\.js$/, `workflows/${e}`);
  });

  for (const f of entries.filter((n) => n.endsWith('.js'))) {
    const file = path.join(workflowsDir, f);
    test(`workflows/${f}`, () => {
      const text = fs.readFileSync(file, 'utf8');
      assert.ok(Buffer.byteLength(text) <= MAX_BYTES, `≤ ${MAX_BYTES} bytes`);

      // Parses under the runtime's contract: the body runs inside an async function (top-level await and
      // `return` are allowed), so constructing that function parses it without running it.
      assert.doesNotThrow(() => new AsyncFunction('agent', 'parallel', 'pipeline', 'phase', 'log', 'args', 'budget', 'workflow',
        text.replace(/^export const meta/, 'const meta')), 'the script parses as a workflow body');

      const { literal, body } = metaLiteral(text);
      // A pure literal evaluates with no globals at all.
      const meta = vm.runInNewContext(`(${literal})`, Object.create(null));
      for (const k of Object.keys(meta)) assert.ok(META_KEYS.has(k), `unknown meta key ${k}`);
      assert.equal(meta.name, path.basename(f, '.js'), 'meta.name === file name');
      assert.ok(meta.description && meta.description.length <= 200, 'one-line description');
      assert.match(meta.whenToUse ?? '', /Use when/, 'whenToUse contains "Use when"');
      assert.ok(Array.isArray(meta.phases) && meta.phases.length > 0, 'phases listed');
      const titles = meta.phases.map((p) => p.title);
      assert.equal(new Set(titles).size, titles.length, 'phase titles are unique');

      // phase('X') calls and { phase: 'X' } options use exactly the titles meta declares.
      const used = new Set([...body.matchAll(/\bphase\(\s*'([^']+)'\s*\)/g)].map((m) => m[1]));
      for (const m of body.matchAll(/\bphase:\s*'([^']+)'/g)) used.add(m[1]);
      assert.deepEqual([...used].sort(), [...titles].sort(), 'phase() calls and phase: options match meta.phases');

      // Every plugin agent it launches exists.
      const agents = new Set([...body.matchAll(/shopify-app-kit:\$\{[^}]*\}|shopify-app-kit:([a-z0-9-]+)/g)].map((m) => m[1]).filter(Boolean));
      const roster = [...body.matchAll(/\{\s*name:\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
      for (const a of [...agents, ...roster]) {
        assert.ok(fs.existsSync(path.join(agentsDir, `${a}.md`)), `launches shopify-app-kit:${a}, but agents/${a}.md does not exist`);
      }
      assert.ok(agents.size + roster.length > 0, 'launches at least one kit agent');

      for (const re of FORBIDDEN) assert.doesNotMatch(body, re, `uses ${re} which the Workflow runtime forbids`);
    });
  }
});

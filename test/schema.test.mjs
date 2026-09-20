// The fixture manifests validate against schemas/shopify-app.v1.schema.json; mutants fail.
// Zero dependencies: a small validator covering the JSON Schema keywords the kit schema uses
// (type, const, enum, pattern, minLength, minItems, required, properties, additionalProperties, items, allOf, if/then, $ref).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, '..');
const schema = JSON.parse(fs.readFileSync(path.join(kitRoot, 'schemas', 'shopify-app.v1.schema.json'), 'utf8'));
const fixtures = path.join(here, 'fixtures', 'manifests');

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function deref(ref) {
  assert.match(ref, /^#\//, `only local $ref supported: ${ref}`);
  return ref.slice(2).split('/').reduce((o, k) => o[k], schema);
}

const SUPPORTED = new Set(['$schema', '$id', 'title', 'description', '$defs', 'type', 'const', 'enum', 'pattern', 'minLength',
  'minItems', 'required', 'properties', 'additionalProperties', 'items', 'allOf', 'if', 'then', '$ref']);

// validate(value, subschema, pointer) -> string[] of problems
export function validate(value, s, at = '$') {
  const errs = [];
  if (s === true) return errs;
  if (s === false) return [`${at}: schema false`];
  for (const k of Object.keys(s)) assert.ok(SUPPORTED.has(k), `unsupported keyword ${k} at ${at}; extend the validator`);
  if (s.$ref) errs.push(...validate(value, deref(s.$ref), at));
  const t = typeOf(value);
  if (s.type !== undefined) {
    const types = Array.isArray(s.type) ? s.type : [s.type];
    if (!types.some((x) => x === t || (x === 'number' && t === 'integer'))) errs.push(`${at}: expected type ${types.join('|')}, got ${t}`);
  }
  if (s.const !== undefined && JSON.stringify(value) !== JSON.stringify(s.const)) errs.push(`${at}: must equal ${JSON.stringify(s.const)}`);
  if (s.enum !== undefined && !s.enum.some((x) => JSON.stringify(x) === JSON.stringify(value))) errs.push(`${at}: must be one of ${s.enum.join(' | ')}`);
  if (t === 'string') {
    if (s.pattern !== undefined && !new RegExp(s.pattern).test(value)) errs.push(`${at}: must match ${s.pattern}`);
    if (s.minLength !== undefined && value.length < s.minLength) errs.push(`${at}: shorter than ${s.minLength}`);
  }
  if (t === 'array') {
    if (s.minItems !== undefined && value.length < s.minItems) errs.push(`${at}: fewer than ${s.minItems} items`);
    if (s.items !== undefined) value.forEach((v, i) => errs.push(...validate(v, s.items, `${at}[${i}]`)));
  }
  if (t === 'object') {
    for (const r of s.required ?? []) if (!(r in value)) errs.push(`${at}: missing required ${r}`);
    for (const [k, v] of Object.entries(value)) {
      if (s.properties && k in s.properties) errs.push(...validate(v, s.properties[k], `${at}.${k}`));
      else if (s.additionalProperties === false) errs.push(`${at}: unexpected property ${k}`);
      else if (s.additionalProperties && typeof s.additionalProperties === 'object') errs.push(...validate(v, s.additionalProperties, `${at}.${k}`));
    }
  }
  for (const sub of s.allOf ?? []) errs.push(...validate(value, sub, at));
  if (s.if !== undefined && validate(value, s.if, at).length === 0 && s.then !== undefined) errs.push(...validate(value, s.then, at));
  return errs;
}

const load = (name) => JSON.parse(fs.readFileSync(path.join(fixtures, name), 'utf8'));
const mutate = (name, fn) => { const m = load(name); fn(m); return m; };

describe('schema v1', () => {
  test('is draft 2020-12 and closed at the top level only', () => {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);
    for (const [k, v] of Object.entries(schema.properties)) {
      if (k === 'packageManagers') continue; // values are constrained, keys are free
      assert.notEqual(v.additionalProperties, false, `${k} must stay additive`);
    }
  });

  for (const f of fs.readdirSync(fixtures).filter((n) => n.endsWith('.json'))) {
    test(`fixture ${f} validates`, () => {
      assert.deepEqual(validate(load(f), schema), []);
    });
  }

  const mutants = [
    ['bad policy enum', (m) => { m.shopifyCli.deployPolicy = 'yolo'; }, /shopifyCli\.deployPolicy: must be one of/],
    ['bad themeDevFromRoot enum', (m) => { m.shopifyCli.themeDevFromRoot = 'maybe'; }, /themeDevFromRoot: must be one of block \| allow/],
    ['missing protected', (m) => { delete m.branches.protected; }, /branches: missing required protected/],
    ['empty protected', (m) => { m.branches.protected = []; }, /branches\.protected: fewer than 1 items/],
    ['bad apiVersion', (m) => { m.apiVersion.expected = '2026-05'; }, /apiVersion\.expected: must match/],
    ['bad schemaVersion', (m) => { m.kit.schemaVersion = 2; }, /kit\.schemaVersion: must equal 1/],
    ['kit.version number', (m) => { m.kit.version = 1; }, /kit\.version: expected type string\|null/],
    ['unknown top-level key', (m) => { m.extra = {}; }, /\$: unexpected property extra/],
    ['bad package manager', (m) => { m.packageManagers.web = 'yarn'; }, /packageManagers\.web: must be one of npm \| pnpm/],
    ['promotion missing to', (m) => { m.branches.promotion = { from: 'beta' }; }, /branches\.promotion: missing required to/],
    ['config-required deploy without configs.deploy', (m) => { delete m.shopifyCli.configs.deploy; }, /shopifyCli\.configs: missing required deploy/],
    ['config-required dev without configs', (m) => { delete m.shopifyCli.configs; }, /shopifyCli: missing required configs/],
    ['database without provider', (m) => { delete m.database.provider; }, /database: missing required provider/],
  ];
  for (const [label, fn, re] of mutants) {
    test(`mutant (npm-root): ${label} fails`, () => {
      const errs = validate(mutate('npm-root-app.json', fn), schema);
      assert.ok(errs.length > 0, 'expected problems');
      assert.ok(errs.some((e) => re.test(e)), `expected ${re} in ${JSON.stringify(errs)}`);
    });
  }

  test('mutant (pnpm-root): switching deploy to config-required without configs fails', () => {
    const errs = validate(mutate('pnpm-root-app.json', (m) => { m.shopifyCli.deployPolicy = 'config-required'; }), schema);
    assert.ok(errs.some((e) => /shopifyCli: missing required configs/.test(e)), JSON.stringify(errs));
  });

  test('top-level $schema and $comment metadata keys are allowed', () => {
    const m = load('annotated-app.json');
    assert.equal(typeof m.$schema, 'string');
    assert.equal(typeof m.$comment, 'string');
    assert.deepEqual(validate(m, schema), []);
  });

  test('an unrelated unknown key still fails next to the metadata keys', () => {
    const errs = validate(mutate('annotated-app.json', (m) => { m.$notes = 'x'; }), schema);
    assert.deepEqual(errs, ['$: unexpected property $notes']);
  });

  test('metadata keys must be strings', () => {
    const errs = validate(mutate('annotated-app.json', (m) => { m.$comment = { text: 'x' }; }), schema);
    assert.ok(errs.some((e) => /\$\.\$comment: expected type string/.test(e)), JSON.stringify(errs));
  });

  test('sections may grow additively', () => {
    assert.deepEqual(validate(mutate('npm-root-app.json', (m) => { m.deploy.newThing = true; m.app.extra = 'x'; }), schema), []);
  });
});

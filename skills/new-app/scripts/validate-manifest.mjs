#!/usr/bin/env node
// skills/new-app/scripts/validate-manifest.mjs: validates a consumer's .claude/shopify-app.json against the kit's
// schemas/shopify-app.v1.schema.json. Zero dependencies; the validator is the same small JSON Schema subset the
// kit's own tests use (test/lib/schema-validate.mjs), copied here so a scaffolded repo can run it without the
// kit's test tree. Also rejects a manifest that still carries a {{PLACEHOLDER}}.
//
//   node validate-manifest.mjs <path/to/shopify-app.json> [--schema <path/to/schema.json>]
//
// Exit 0 and "OK" when the manifest validates; exit 1 with one problem per line otherwise.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
let manifestPath = null;
let schemaPath = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--schema') schemaPath = argv[++i];
  else if (argv[i] === '--help' || argv[i] === '-h') { console.log('node validate-manifest.mjs <manifest.json> [--schema <schema.json>]'); process.exit(0); }
  else manifestPath = argv[i];
}
if (!manifestPath) { console.error('validate-manifest: pass the manifest path'); process.exit(1); }
schemaPath ??= process.env.CLAUDE_PLUGIN_ROOT
  ? path.join(process.env.CLAUDE_PLUGIN_ROOT, 'schemas', 'shopify-app.v1.schema.json')
  : path.resolve(here, '..', '..', '..', 'schemas', 'shopify-app.v1.schema.json');

const problems = [];
const raw = fs.readFileSync(manifestPath, 'utf8');
const placeholders = [...new Set([...raw.matchAll(/\{\{([A-Z][A-Z0-9_]*)\}\}/g)].map((m) => m[1]))];
for (const p of placeholders) problems.push(`$: unsubstituted placeholder {{${p}}}`);
let manifest;
try { manifest = JSON.parse(raw); } catch (e) { problems.push(`$: not valid JSON (${e.message})`); }
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return Number.isInteger(v) ? 'integer' : 'number';
  return typeof v;
}

function deref(ref) {
  if (!ref.startsWith('#/')) throw new Error(`only local $ref supported: ${ref}`);
  return ref.slice(2).split('/').reduce((o, k) => o[k], schema);
}

const SUPPORTED = new Set(['$schema', '$id', 'title', 'description', '$defs', 'type', 'const', 'enum', 'pattern', 'minLength',
  'minItems', 'required', 'properties', 'additionalProperties', 'items', 'allOf', 'if', 'then', '$ref']);

// validate(value, subschema, pointer) -> string[] of problems
export function validate(value, s, at = '$') {
  const errs = [];
  if (s === true) return errs;
  if (s === false) return [`${at}: schema false`];
  for (const k of Object.keys(s)) if (!SUPPORTED.has(k)) throw new Error(`unsupported keyword ${k} at ${at}; extend the validator`);
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

if (manifest !== undefined) problems.push(...validate(manifest, schema));
if (problems.length) {
  console.error(`${manifestPath} does not satisfy schema v1 (${path.relative(process.cwd(), schemaPath)}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`OK: ${manifestPath} validates against schema v1 (kit.version ${manifest.kit?.version ?? 'null'}).`);

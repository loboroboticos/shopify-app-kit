// A small JSON Schema validator covering the keywords schemas/shopify-app.v1.schema.json uses
// (type, const, enum, pattern, minLength, minItems, required, properties, additionalProperties, items, allOf,
// if/then, $ref). Zero dependencies. Shared by test/schema.test.mjs and test/templates.test.mjs.
import assert from 'node:assert/strict';
import { kitRoot, read } from './fs.mjs';

export { kitRoot };
export const schema = JSON.parse(read('schemas', 'shopify-app.v1.schema.json'));

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

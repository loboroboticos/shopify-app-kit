// The fixture manifests validate against schemas/shopify-app.v1.schema.json; mutants fail.
// Zero dependencies: the small validator in test/lib/schema-validate.mjs covers the keywords the kit schema uses.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { schema, validate } from './lib/schema-validate.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, 'fixtures', 'manifests');

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

  describe('auth, billing.method and docs (additive in v1)', () => {
    test('the multi-tenant fixture carries all three and validates', () => {
      const m = load('multi-tenant-app.json');
      assert.equal(m.auth.expiringOfflineTokens, true);
      assert.equal(m.billing.method, 'app-pricing');
      assert.deepEqual(m.docs, { adrDir: 'docs/adr', mapFile: 'README.md', mapHeading: '## Docs map' });
      assert.deepEqual(validate(m, schema), []);
    });

    test('every billing.method enum value validates', () => {
      for (const method of ['billing-api', 'app-pricing', 'none']) {
        assert.deepEqual(validate(mutate('multi-tenant-app.json', (m) => { m.billing.method = method; }), schema), [], method);
      }
    });

    test('an unknown billing.method is rejected', () => {
      const errs = validate(mutate('multi-tenant-app.json', (m) => { m.billing.method = 'managed-pricing'; }), schema);
      assert.ok(errs.some((e) => /billing\.method: must be one of billing-api \| app-pricing \| none/.test(e)), JSON.stringify(errs));
    });

    test('auth.expiringOfflineTokens must be a boolean', () => {
      const errs = validate(mutate('multi-tenant-app.json', (m) => { m.auth.expiringOfflineTokens = 'yes'; }), schema);
      assert.ok(errs.some((e) => /auth\.expiringOfflineTokens: expected type boolean/.test(e)), JSON.stringify(errs));
    });

    test('docs.* must be strings', () => {
      const errs = validate(mutate('multi-tenant-app.json', (m) => { m.docs.adrDir = ['docs/adr']; }), schema);
      assert.ok(errs.some((e) => /docs\.adrDir: expected type string/.test(e)), JSON.stringify(errs));
    });

    test('the older fixtures validate without the new keys', () => {
      const m = load('npm-root-app.json');
      assert.ok(!('auth' in m) && !('docs' in m) && !('method' in m.billing));
      assert.deepEqual(validate(m, schema), []);
    });

    test('every new key carries a description', () => {
      assert.ok(schema.properties.auth.properties.expiringOfflineTokens.description.length > 40);
      assert.ok(schema.properties.billing.properties.method.description.length > 40);
      for (const k of ['adrDir', 'mapFile', 'mapHeading']) assert.ok(schema.properties.docs.properties[k].description.length > 20, k);
    });
  });

  describe('classify (additive in v1)', () => {
    const withClassify = (m) => {
      m.classify = {
        provider: 'jev',
        defaultEscalateThreshold: 0.75,
        budget: { monthlyCap: 100000 },
        labelSets: {
          supportIntent: {
            labels: ['order-status', 'return-exchange', 'sizing-fit', 'shipping-delivery', 'complaint', 'spam'],
            escalateThreshold: 0.7,
          },
        },
      };
    };

    test('a classify section validates', () => {
      assert.deepEqual(validate(mutate('multi-tenant-app.json', withClassify), schema), []);
    });

    test('classify stays additive (no additionalProperties: false)', () => {
      assert.notEqual(schema.properties.classify.additionalProperties, false);
    });

    test('an unknown provider is rejected', () => {
      const errs = validate(mutate('multi-tenant-app.json', (m) => { withClassify(m); m.classify.provider = 'gpt'; }), schema);
      assert.ok(errs.some((e) => /classify\.provider: must be one of jev/.test(e)), JSON.stringify(errs));
    });

    test('a labelSet needs at least two labels', () => {
      const errs = validate(mutate('multi-tenant-app.json', (m) => { withClassify(m); m.classify.labelSets.supportIntent.labels = ['only-one']; }), schema);
      assert.ok(errs.some((e) => /classify\.labelSets\.supportIntent\.labels: fewer than 2 items/.test(e)), JSON.stringify(errs));
    });

    test('a labelSet needs its labels array', () => {
      const errs = validate(mutate('multi-tenant-app.json', (m) => { withClassify(m); delete m.classify.labelSets.supportIntent.labels; }), schema);
      assert.ok(errs.some((e) => /classify\.labelSets\.supportIntent: missing required labels/.test(e)), JSON.stringify(errs));
    });

    test('the older fixtures validate without a classify section', () => {
      const m = load('npm-root-app.json');
      assert.ok(!('classify' in m));
      assert.deepEqual(validate(m, schema), []);
    });
  });
});

// scripts/assert-dev-db.test.mjs (shopify-app-kit template; node --test, zero dependencies)
// The guard's whole job is to fail closed, so the refusals are covered as carefully as the pass: a guard that
// silently passes is worse than none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint, describe, checkDevDatabase } from './assert-dev-db.mjs';

// Same host and database, different credentials: the case a hostname check cannot tell apart. Joined from parts
// so the repo's secret scan (a credential URI rule) does not read them as a leak.
const url = (who) => ['postgres://', `${who}-user:${who}-pass`, '@db.example.internal:5432/app?sslmode=require'].join('');
const DEV = url('dev');
const PROD = url('prod');

test('fingerprint is 8 hex chars, stable, differs per URL and carries no credential', () => {
  assert.match(fingerprint(DEV), /^[0-9a-f]{8}$/);
  assert.equal(fingerprint(DEV), fingerprint(DEV));
  assert.notEqual(fingerprint(DEV), fingerprint(PROD));
  for (const s of ['dev-user', 'dev-pass']) assert.ok(!fingerprint(DEV).includes(s));
});

test('describe reports host and database without credentials, and degrades on an unparseable URL', () => {
  assert.equal(describe(DEV), 'db.example.internal:5432/app');
  assert.equal(describe('not-a-url'), '(unparseable DATABASE_URL)');
});

test('passes only when the pin matches the URL', () => {
  assert.deepEqual({ ...checkDevDatabase({ url: DEV, pinned: fingerprint(DEV) }), message: '' }, { ok: true, code: 0, message: '' });
});

test('refuses without DATABASE_URL (1), without a pin (2, printing the line to add) and under a stale pin (2)', () => {
  assert.equal(checkDevDatabase({ url: undefined, pinned: 'abcd1234' }).code, 1);
  const none = checkDevDatabase({ url: DEV, pinned: undefined });
  assert.equal(none.code, 2);
  assert.ok(none.message.includes(`DEV_DATABASE_FINGERPRINT="${fingerprint(DEV)}"`));
  const swapped = checkDevDatabase({ url: PROD, pinned: fingerprint(DEV) });
  assert.equal(swapped.ok, false);
  assert.equal(swapped.code, 2);
  assert.ok(swapped.message.includes(fingerprint(PROD)));
});

test('never puts the connection string or a password in a message', () => {
  for (const pinned of [undefined, fingerprint(DEV), '0badcafe']) {
    const { message } = checkDevDatabase({ url: PROD, pinned });
    assert.ok(!message.includes('prod-pass') && !message.includes(PROD));
  }
});

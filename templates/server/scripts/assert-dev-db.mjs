#!/usr/bin/env node
// scripts/assert-dev-db.mjs (shopify-app-kit template; new-app writes it to the server directory)
// Refuses to migrate a database the developer has not declared. The dev command runs `prisma migrate deploy`
// before the server, so whatever DATABASE_URL sits in .env is migrated: a stray production string migrates the
// live database on the first pending migration. Prefix the dev command (and a hosted non-production release) with
//   node --env-file-if-exists=.env scripts/assert-dev-db.mjs &&
// A fingerprint, not a hostname check: a dev database can be a second project on the same host and database
// name as production, differing only in credentials. So the whole URL is pinned: sha256(DATABASE_URL), first 8
// hex characters, declared as DEV_DATABASE_FINGERPRINT (one-way; stores no credential). Production never runs it.
// Exit: 0 the declared database matches · 1 no DATABASE_URL · 2 no pin, or a pin that does not match.
// Its test: scripts/assert-dev-db.test.mjs (node --test).
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** The truncated one-way fingerprint of a connection string: short enough to eyeball, ample against collision. */
export function fingerprint(url) {
  return createHash('sha256').update(url, 'utf8').digest('hex').slice(0, 8);
}

/** Host, port and database for the report; never the credentials. */
export function describe(url) {
  try {
    const u = new URL(url);
    return `${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

/** The pure decision, testable without a database or an env file: { ok, code, message }. */
export function checkDevDatabase({ url, pinned }) {
  if (!url) {
    return { ok: false, code: 1, message: 'DATABASE_URL is not set. Local dev needs its own database, never production: create one, put it in .env, then re-run.' };
  }
  const actual = fingerprint(url);
  const where = describe(url);
  if (!pinned) {
    return {
      ok: false,
      code: 2,
      message:
        `DEV_DATABASE_FINGERPRINT is not set, so this refuses to migrate ${where}.\n\n` +
        'If that is a database you own (not production), declare it in .env (local dev) or in the hosted\n' +
        `non-production environment's variables:\n\n  DEV_DATABASE_FINGERPRINT="${actual}"\n\n` +
        'An undeclared database is one this refuses to touch; production migrates through its own release step.',
    };
  }
  if (pinned !== actual) {
    return {
      ok: false,
      code: 2,
      message:
        `DATABASE_URL does not match the declared database.\n\n  declared: ${pinned}\n  actual:   ${actual}  (${where})\n\n` +
        'The connection string changed since it was pinned. If this is a database you own (not production), set\n' +
        'DEV_DATABASE_FINGERPRINT to the actual value above. If you did not expect this, STOP: check whether\n' +
        'DATABASE_URL points at production.',
    };
  }
  return { ok: true, code: 0, message: `dev database ${where} (${actual}) is the declared one; proceeding.` };
}

// Only as a CLI, so a test can import the helpers without reading the environment.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = checkDevDatabase({ url: process.env.DATABASE_URL, pinned: process.env.DEV_DATABASE_FINGERPRINT });
  if (result.ok) console.log(`[dev-db] ${result.message}`);
  else {
    console.error(`\n[dev-db] ${result.message}\n`);
    process.exit(result.code);
  }
}

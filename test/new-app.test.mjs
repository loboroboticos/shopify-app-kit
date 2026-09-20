// The new-app skill: its frontmatter (user-invoked, the argument hint, the allowed tools), every placeholder it
// mentions is documented in templates/README.md, its scripts are linked, validate-manifest.mjs accepts the
// substituted starter manifest and rejects a bad billing.method, and apply-overlay.mjs run against a stand-in
// template (what `shopify app init` leaves behind: package.json, the Shopify server module, a Prisma schema with a
// Session model, CLAUDE.md, .gitignore) yields a repo where the manifest validates, no placeholder survives but the
// gitleaks pair, the guards are vendored and fire, the docs-consistency test passes, the post-scaffold edits landed,
// and a second run changes nothing. Zero dependencies; the guard smoke test needs jq like the guards themselves.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, '..');
const skillDir = path.join(kitRoot, 'skills', 'new-app');
const scripts = path.join(skillDir, 'scripts');
const templatesDir = path.join(kitRoot, 'templates');
const KIT_VERSION = JSON.parse(fs.readFileSync(path.join(kitRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const skill = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
const templatesReadme = fs.readFileSync(path.join(templatesDir, 'README.md'), 'utf8');
const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1');
  }
  return out;
}

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (entry.name !== 'node_modules' && entry.name !== '.git') yield* walk(p); } else if (entry.isFile()) yield p;
  }
}
const snapshot = (dir) => Object.fromEntries([...walk(dir)].sort().map((f) => [path.relative(dir, f), fs.readFileSync(f, 'utf8')]));
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...opts });
// A nested `node --test` must not inherit this runner's child context, or it reports to us instead of stdout.
const childEnv = () => { const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; return env; };
const docsTest = (cwd) => run(process.execPath, ['--test', 'test/docs-consistency.test.mjs'], { cwd, env: childEnv() });
const node = (script, args, opts = {}) => run(process.execPath, [path.join(scripts, script), ...args], opts);

// A stand-in for what `shopify app init` leaves: enough of the template for the overlay's edits to have a target.
function standIn(dir, serverDir = '.') {
  const server = path.join(dir, serverDir);
  fs.mkdirSync(path.join(server, 'app', 'routes'), { recursive: true });
  fs.mkdirSync(path.join(server, 'prisma', 'migrations', '20240101000000_init'), { recursive: true });
  fs.writeFileSync(path.join(server, 'package.json'), JSON.stringify({ name: 'app', private: true, type: 'module', scripts: { dev: 'shopify app dev', deploy: 'shopify app deploy' } }, null, 2));
  fs.writeFileSync(path.join(server, 'app', 'shopify.server.ts'), `import { shopifyApp, ApiVersion } from "@shopify/shopify-app-react-router/server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiVersion: ApiVersion.July26,
  ...(process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}),
});

export default shopify;
`);
  fs.writeFileSync(path.join(server, 'prisma', 'schema.prisma'), `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:dev.sqlite"
}

model Session {
  id          String    @id
  shop        String
  state       String
  isOnline    Boolean   @default(false)
  expires     DateTime?
  accessToken String
}
`);
  fs.writeFileSync(path.join(server, 'prisma', 'migrations', '20240101000000_init', 'migration.sql'), 'CREATE TABLE "Session" ("id" TEXT NOT NULL PRIMARY KEY, "expires" DATETIME);\n');
  fs.writeFileSync(path.join(server, 'shopify.app.toml'), 'client_id = ""\n\n[access_scopes]\nscopes = "write_products"\n\n[webhooks]\napi_version = "2026-07"\n');
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '@AGENTS.md\n');
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Template agents file\n');
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n.env\n');
  fs.writeFileSync(path.join(dir, 'README.md'), '# Shopify App Template - React Router\n');
}

function overlay(dir, extra = []) {
  return node('apply-overlay.mjs', ['--target', dir, '--app-name', 'Example App', '--kit-root', kitRoot, '--template-ref', 'https://github.com/Shopify/shopify-app-template-react-router#0000000', ...extra]);
}

describe('skills/new-app/SKILL.md', () => {
  const fm = frontmatter(skill);
  test('is user-invoked with the documented argument hint', () => {
    assert.equal(fm.name, 'new-app');
    assert.equal(fm['disable-model-invocation'], 'true');
    for (const flag of ['<app-name>', '--server-dir <dir>', '--pm npm|pnpm', '--default-branch <b>', '--protected-branch <b>', '--dry-run <dir>']) {
      assert.ok(fm['argument-hint'].includes(flag), `argument-hint mentions ${flag}`);
    }
    assert.match(fm.description, /Use when/);
    assert.ok(fm.description.length <= 1024);
  });

  test('allows only the read/write tools and the seven Bash prefixes', () => {
    const tools = fm['allowed-tools'].split(',').map((t) => t.trim()).sort();
    assert.deepEqual(tools, ['Bash(bash *)', 'Bash(claude plugin *)', 'Bash(git *)', 'Bash(node *)', 'Bash(npm *)', 'Bash(pnpm *)', 'Bash(shopify app init *)', 'Edit', 'Glob', 'Grep', 'Read', 'Write']);
  });

  test('every placeholder the skill and its references mention is documented in templates/README.md', () => {
    const documented = new Set([...templatesReadme.matchAll(/^\| `\{\{([A-Z][A-Z0-9_]*)\}\}` \|/gm)].map((m) => m[1]));
    const texts = [skill, ...fs.readdirSync(path.join(skillDir, 'references')).map((f) => fs.readFileSync(path.join(skillDir, 'references', f), 'utf8'))];
    const mentioned = new Set(texts.flatMap((t) => [...t.matchAll(PLACEHOLDER)].map((m) => m[1])));
    assert.ok(mentioned.size >= 5, 'the skill names the placeholders it substitutes');
    assert.deepEqual([...mentioned].filter((p) => !documented.has(p)), [], 'a placeholder the skill mentions is missing from templates/README.md');
    for (const p of ['APP_NAME', 'DEFAULT_BRANCH', 'PROTECTED_BRANCH', 'PACKAGE_MANAGER', 'SERVER_DIR', 'GITLEAKS_VERSION', 'GITLEAKS_SHA256']) assert.ok(mentioned.has(p), `the skill mentions {{${p}}}`);
  });

  test('the steps cover the brief: preconditions, init, overlay, edits, verification, commit, dry run', () => {
    for (const s of ['shopify app init --help', 'apply-overlay.mjs', 'validate-manifest.mjs', 'smoke-guards.sh', 'docs-consistency.test.mjs', 'git init -b', 'expiringOfflineAccessTokens', 'refreshTokenExpires', '0001-scaffold.md', '--dry-run', 'checksums.txt', 'DIRECT_DATABASE_URL']) {
      assert.ok(skill.includes(s), `SKILL.md mentions ${s}`);
    }
    assert.ok(!/shopify auth login/.test(skill), 'the skill never logs the CLI in');
  });

  test('links its three scripts and two references', () => {
    for (const f of fs.readdirSync(scripts)) assert.ok(skill.includes(`scripts/${f}`), f);
    for (const f of fs.readdirSync(path.join(skillDir, 'references'))) assert.ok(skill.includes(`references/${f}`), f);
    assert.deepEqual(fs.readdirSync(scripts).sort(), ['apply-overlay.mjs', 'smoke-guards.sh', 'validate-manifest.mjs']);
  });
});

describe('scripts/validate-manifest.mjs', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-validate-'));
  const starter = fs.readFileSync(path.join(templatesDir, '.claude', 'shopify-app.json'), 'utf8');
  const substituted = starter.replace(PLACEHOLDER, (m, k) => ({ APP_NAME: 'Example App', DEFAULT_BRANCH: 'main', PROTECTED_BRANCH: 'main', PACKAGE_MANAGER: 'npm', SERVER_DIR: '.' })[k] ?? m);

  test('accepts the substituted starter manifest', () => {
    const p = path.join(tmp, 'good.json');
    fs.writeFileSync(p, substituted);
    const r = node('validate-manifest.mjs', [p]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^OK: .*validates against schema v1/);
  });

  test('rejects a bad billing.method', () => {
    const m = JSON.parse(substituted);
    m.billing.method = 'managed-pricing';
    const p = path.join(tmp, 'bad-billing.json');
    fs.writeFileSync(p, JSON.stringify(m));
    const r = node('validate-manifest.mjs', [p]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /billing\.method: must be one of billing-api \| app-pricing \| none/);
  });

  test('rejects a manifest that still carries a placeholder', () => {
    const p = path.join(tmp, 'raw.json');
    fs.writeFileSync(p, starter);
    const r = node('validate-manifest.mjs', [p]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unsubstituted placeholder \{\{APP_NAME\}\}/);
  });

  test('honours --schema and CLAUDE_PLUGIN_ROOT', () => {
    const p = path.join(tmp, 'good.json');
    assert.equal(node('validate-manifest.mjs', [p, '--schema', path.join(kitRoot, 'schemas', 'shopify-app.v1.schema.json')]).status, 0);
    assert.equal(node('validate-manifest.mjs', [p], { env: { ...process.env, CLAUDE_PLUGIN_ROOT: kitRoot } }).status, 0);
  });
});

describe('scripts/apply-overlay.mjs on a stand-in template', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-new-app-'));
  standIn(dir);
  const before = snapshot(dir);
  const first = overlay(dir, ['--print-tree']);
  const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

  test('runs, reports each action and the gitleaks TODO, and prints the tree', () => {
    assert.equal(first.status, 0, first.stderr);
    for (const line of ['write  .claude/shopify-app.json', 'write  .github/workflows/ci.yml', 'merge  CLAUDE.md', 'vendor .claude/hooks/kit/lib.sh', 'write  docs/README.md', 'write  docs/adr/0001-scaffold.md', 'edit   docs/adr/README.md', 'edit   app/shopify.server.ts', 'edit   prisma/schema.prisma', 'remove prisma/migrations']) {
      assert.ok(first.stdout.includes(line), `report has "${line}"\n${first.stdout}`);
    }
    assert.match(first.stdout, /TODO before the first push:\n\s+- \.github\/workflows\/secret-scan\.yml: replace \{\{GITLEAKS_VERSION\}\} and \{\{GITLEAKS_SHA256\}\}.*checksums\.txt/);
    assert.match(first.stdout, /\nTree:\n(  .+\n)+/);
    assert.match(first.stdout, /apply-overlay: kit v\d+\.\d+\.\d+ applied .*slug example-app, npm, server dir \., branches main\/main/);
  });

  test('every template file listed in templates/README.md landed (or merged), placeholders substituted', () => {
    const listed = [...templatesReadme.matchAll(/^\| `([^`{}]+)` \|/gm)].map((m) => m[1]).filter((f) => f !== 'docs/README-docs-map.md');
    for (const f of listed) assert.ok(fs.existsSync(path.join(dir, f)), `${f} exists in the scaffold`);
    const survivors = [];
    for (const f of Object.keys(snapshot(dir))) for (const m of read(f).matchAll(PLACEHOLDER)) survivors.push(`${f}: {{${m[1]}}}`);
    assert.deepEqual([...new Set(survivors)].sort(), ['.github/workflows/secret-scan.yml: {{GITLEAKS_SHA256}}', '.github/workflows/secret-scan.yml: {{GITLEAKS_VERSION}}']);
    assert.match(read('.github/workflows/ci.yml'), /branches: \['main', 'main'\]/);
    assert.match(read('CLAUDE.md'), /^# Example App$/m);
  });

  test('the manifest validates, is stamped with the kit version and the tag $schema, and uses the slug', () => {
    const m = JSON.parse(read('.claude/shopify-app.json'));
    assert.equal(m.kit.version, KIT_VERSION);
    assert.equal(m.$schema, `https://raw.githubusercontent.com/loboroboticos/shopify-app-kit/v${KIT_VERSION}/schemas/shopify-app.v1.schema.json`);
    assert.equal(m.app.name, 'Example App');
    assert.deepEqual(m.branches, { default: 'main', protected: ['main'], promotion: null });
    assert.deepEqual(m.packageManagers, { '.': 'npm' });
    assert.deepEqual(m.shopifyCli.configs, { dev: 'example-app-dev', deploy: 'example-app' });
    assert.deepEqual(m.paths.appTomls, ['shopify.app.example-app.toml', 'shopify.app.example-app-dev.toml']);
    assert.equal(m.paths.shopifyServer, 'app/shopify.server.ts');
    assert.deepEqual(m.apiVersion.pins, ['app/shopify.server.ts', 'shopify.app.example-app.toml', 'shopify.app.example-app-dev.toml']);
    assert.equal(m.docs.mapFile, 'docs/README.md');
    const r = node('validate-manifest.mjs', [path.join(dir, '.claude', 'shopify-app.json')]);
    assert.equal(r.status, 0, r.stderr);
  });

  test('never overwrites a template file: CLAUDE.md keeps its line and gains a delimited kit section; untouched files are untouched', () => {
    const claude = read('CLAUDE.md');
    assert.ok(claude.startsWith('@AGENTS.md\n'));
    assert.match(claude, new RegExp(`<!-- shopify-app-kit overlay: begin \\(kit v${KIT_VERSION.replace(/\./g, '\\.')}\\) -->`));
    assert.match(claude, /<!-- shopify-app-kit overlay: end -->\n$/);
    assert.equal((claude.match(/overlay: begin/g) ?? []).length, 1);
    assert.equal(read('.gitignore'), before['.gitignore']);
    assert.equal(read('README.md'), before['README.md']);
    assert.equal(read('AGENTS.md'), before['AGENTS.md']);
    assert.equal(read('shopify.app.toml'), before['shopify.app.toml']);
  });

  test('vendors lib.sh and every guard with the kit header, executable', () => {
    const kitHooks = fs.readdirSync(path.join(kitRoot, 'hooks')).filter((n) => n === 'lib.sh' || /^guard-.*\.sh$/.test(n)).sort();
    assert.deepEqual(fs.readdirSync(path.join(dir, '.claude', 'hooks', 'kit')).sort(), kitHooks);
    for (const h of kitHooks) {
      assert.equal(read(`.claude/hooks/kit/${h}`).split('\n')[1], `# shopify-app-kit v${KIT_VERSION}`);
      assert.ok(fs.statSync(path.join(dir, '.claude', 'hooks', 'kit', h)).mode & 0o100, `${h} is executable`);
    }
    assert.ok(fs.statSync(path.join(dir, '.claude', 'hooks', 'kit-bootstrap.sh')).mode & 0o100);
  });

  test('the post-scaffold edits landed: token flag, session columns, Postgres datasource, SQLite migration gone', () => {
    const server = read('app/shopify.server.ts');
    assert.match(server, /shopifyApp\(\{\n  future: \{ expiringOfflineAccessTokens: true \},/);
    const schema = read('prisma/schema.prisma');
    assert.match(schema, /model Session \{[\s\S]*refreshToken\s+String\?\n\s+refreshTokenExpires DateTime\?\n\}/);
    assert.match(schema, /provider\s+= "postgresql"/);
    assert.match(schema, /url\s+= env\("DATABASE_URL"\)/);
    assert.match(schema, /directUrl = env\("DIRECT_DATABASE_URL"\)/);
    assert.ok(!fs.existsSync(path.join(dir, 'prisma', 'migrations')));
    assert.match(first.stdout, /prisma\/migrations: generate the first Postgres migration/);
  });

  test('writes the docs map with rows only for files that exist, the first ADR and its index row', () => {
    const map = read('docs/README.md');
    assert.match(map, /^## Docs map$/m);
    const rows = [...map.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
    assert.ok(rows.includes('docs/README.md') && rows.includes('docs/adr/README.md') && rows.includes('docs/adr/SEEDS.md') && rows.includes('docs/history/'), rows.join(','));
    for (const r of rows) assert.ok(fs.existsSync(path.join(dir, r)), `${r} exists`);
    assert.match(map, /Planned documents[\s\S]*docs\/architecture\.md/);
    const adr = read('docs/adr/0001-scaffold.md');
    assert.match(adr, /^---\nstatus: accepted\ndate: \d{4}-\d{2}-\d{2}\ndeciders: .+\n---/);
    assert.match(adr, /# 0001\. Scaffold from the Shopify React Router template/);
    assert.ok(adr.includes(`kit v${KIT_VERSION}`));
    assert.ok(adr.includes('shopify-app-template-react-router#0000000'));
    assert.match(adr, /## Consequences[\s\S]*1\. Backend and isolation model[\s\S]*13\. Branch model/);
    assert.match(read('docs/adr/README.md'), /^\| 0001 \| \[Scaffold .*\]\(0001-scaffold\.md\) \| accepted \| \d{4}-\d{2}-\d{2} \|$/m);
    assert.ok(fs.existsSync(path.join(dir, '.github', 'ISSUE_TEMPLATE', 'work-item.md')));
  });

  test("the consumer's docs-consistency test passes on the fresh scaffold", () => {
    const r = docsTest(dir);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /^# pass 5$/m);
    assert.match(r.stdout, /^# fail 0$/m);
  });

  test('smoke-guards.sh: every vendored guard exits 0 on a benign command and 2 on the guarded ones', () => {
    const r = run('bash', [path.join(scripts, 'smoke-guards.sh'), dir]);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /PASS guard-shopify-cli\.sh :: shopify app deploy -> exit 2/);
    assert.match(r.stdout, /PASS guard-protected-branch\.sh :: git push origin main -> exit 2/);
    assert.match(r.stdout, /PASS guard-package-manager\.sh :: pnpm install -> exit 2/);
    assert.match(r.stdout, /PASS guard-shopify-cli\.sh :: ls -la && git status -> exit 0/);
    assert.doesNotMatch(r.stdout, /FAIL/);
  });

  test('a second run changes nothing', () => {
    const snap = snapshot(dir);
    const again = overlay(dir);
    assert.equal(again.status, 0, again.stderr);
    assert.match(again.stdout, /ok     \.claude\/shopify-app\.json  \(unchanged\)/);
    assert.match(again.stdout, /update .claude\/settings\.json/);
    assert.deepEqual(snapshot(dir), snap);
  });

  test('smoke-guards.sh fails loudly when a guard does not fire', () => {
    const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-broken-'));
    fs.cpSync(dir, broken, { recursive: true });
    fs.writeFileSync(path.join(broken, '.claude', 'hooks', 'kit', 'guard-shopify-cli.sh'), '#!/usr/bin/env bash\nexit 0\n');
    const r = run('bash', [path.join(scripts, 'smoke-guards.sh'), broken]);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /FAIL guard-shopify-cli\.sh :: shopify app deploy -> exit 0, expected 2/);
  });
});

describe('scripts/apply-overlay.mjs variants and arguments', () => {
  test('--server-dir web with pnpm and a promotion pair prefixes the paths and maps the server directory', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-web-'));
    standIn(dir, 'web');
    const r = overlay(dir, ['--pm', 'pnpm', '--server-dir', 'web', '--default-branch', 'beta', '--protected-branch', 'main']);
    assert.equal(r.status, 0, r.stderr);
    const m = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'shopify-app.json'), 'utf8'));
    assert.deepEqual(m.branches, { default: 'beta', protected: ['main'], promotion: { from: 'beta', to: 'main' } });
    assert.deepEqual(m.packageManagers, { web: 'pnpm' });
    assert.equal(m.paths.server, 'web');
    assert.equal(m.paths.shopifyServer, 'web/app/shopify.server.ts');
    assert.deepEqual(m.paths.appTomls, ['web/shopify.app.example-app.toml', 'web/shopify.app.example-app-dev.toml']);
    assert.match(fs.readFileSync(path.join(dir, '.github', 'dependabot.yml'), 'utf8'), /directory: \/web/);
    assert.match(fs.readFileSync(path.join(dir, 'web', 'app', 'shopify.server.ts'), 'utf8'), /expiringOfflineAccessTokens: true/);
    assert.match(fs.readFileSync(path.join(dir, '.github', 'workflows', 'ci.yml'), 'utf8'), /working-directory: 'web'/);
    const s = run('bash', [path.join(scripts, 'smoke-guards.sh'), dir]);
    assert.equal(s.status, 0, s.stdout + s.stderr);
    assert.match(s.stdout, /PASS guard-package-manager\.sh :: npm install -> exit 2/);
    const d = docsTest(dir);
    assert.equal(d.status, 0, d.stdout + d.stderr);
    assert.match(d.stdout, /^# fail 0$/m);
  });

  test('an existing future block gains the flag and existing session columns are kept', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-future-'));
    standIn(dir);
    const server = path.join(dir, 'app', 'shopify.server.ts');
    fs.writeFileSync(server, fs.readFileSync(server, 'utf8').replace('apiKey:', 'future: {\n    unstable_x: true,\n  },\n  apiKey:'));
    const schema = path.join(dir, 'prisma', 'schema.prisma');
    fs.writeFileSync(schema, fs.readFileSync(schema, 'utf8').replace('accessToken String\n', 'accessToken String\n  refreshToken String?\n  refreshTokenExpires DateTime?\n'));
    const r = overlay(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(fs.readFileSync(server, 'utf8'), /future: \{\n    expiringOfflineAccessTokens: true,\n    unstable_x: true,/);
    assert.match(r.stdout, /ok     prisma\/schema\.prisma  \(Session carries refreshToken and refreshTokenExpires\)/);
    assert.equal((fs.readFileSync(schema, 'utf8').match(/refreshTokenExpires/g) ?? []).length, 1);
  });

  test('a file the template has and the kit cannot merge is set aside; JSON is deep-merged', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-aside-'));
    standIn(dir);
    fs.mkdirSync(path.join(dir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.github', 'workflows', 'ci.yml'), 'name: template ci\non: push\n');
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(ls *)'] }, enabledPlugins: { 'other@x': true } }));
    const r = overlay(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /aside  \.github\/workflows\/ci\.yml\.shopify-app-kit/);
    assert.equal(fs.readFileSync(path.join(dir, '.github', 'workflows', 'ci.yml'), 'utf8'), 'name: template ci\non: push\n');
    assert.ok(fs.existsSync(path.join(dir, '.github', 'workflows', 'ci.yml.shopify-app-kit')));
    const s = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'));
    assert.deepEqual(s.permissions, { allow: ['Bash(ls *)'] });
    assert.equal(s.enabledPlugins['other@x'], true);
    assert.equal(s.enabledPlugins['shopify-app-kit@shopify-app-kit'], true);
    assert.ok(s.hooks.PreToolUse.some((h) => h.hooks.some((x) => x.command.includes('guard-shopify-cli.sh'))));
  });

  test('rejects a bad package manager, a bad branch name, a missing name and a server dir outside the repo', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-args-'));
    const bad = (args, re) => { const r = node('apply-overlay.mjs', ['--target', dir, '--kit-root', kitRoot, ...args]); assert.equal(r.status, 1); assert.match(r.stderr, re); };
    bad(['--app-name', 'x', '--pm', 'yarn'], /--pm must be npm or pnpm/);
    bad(['--app-name', 'x', '--default-branch', 'a..b'], /not a valid branch name/);
    bad(['--app-name', 'x', '--protected-branch', '-main'], /not a valid branch name/);
    bad(['--pm', 'npm'], /--app-name is required/);
    bad(['--app-name', 'x', '--server-dir', '../elsewhere'], /--server-dir must be inside the repo/);
    assert.deepEqual(fs.readdirSync(dir), [], 'nothing was written');
  });
});

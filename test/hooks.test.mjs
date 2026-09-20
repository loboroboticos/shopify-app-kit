// Spawns bash on each hook with a PreToolUse/SessionStart JSON on stdin and SHOPIFY_APP_KIT_MANIFEST pointing at a
// fixture. Exit 2 means blocked (stderr must match), exit 0 means allowed. Zero dependencies (node:test).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const kitRoot = path.resolve(here, '..');
const hooksDir = path.join(kitRoot, 'hooks');
const fixtures = path.join(here, 'fixtures', 'manifests');
const KIT_VERSION = JSON.parse(fs.readFileSync(path.join(kitRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version;

// A fake consumer checkout: the guard treats this as the repo root (theme dev "from the repo root" cases).
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-consumer-'));
fs.mkdirSync(path.join(consumer, 'web'), { recursive: true });
fs.mkdirSync(path.join(consumer, 'scratch'), { recursive: true });
const MISSING = path.join(consumer, 'nope', 'shopify-app.json');

function runHook(hook, { manifest, command, cwd = consumer, event = 'PreToolUse', extraEnv = {} }) {
  const payload = event === 'PreToolUse'
    ? { hook_event_name: event, tool_name: 'Bash', tool_input: { command }, cwd }
    : { hook_event_name: event, source: 'startup', cwd };
  const env = { ...process.env, CLAUDE_PROJECT_DIR: consumer, ...extraEnv };
  delete env.SHOPIFY_APP_KIT_ROOT;
  if (manifest === undefined) delete env.SHOPIFY_APP_KIT_MANIFEST; else env.SHOPIFY_APP_KIT_MANIFEST = manifest;
  const res = spawnSync('bash', [path.join(hooksDir, hook)], { input: JSON.stringify(payload), encoding: 'utf8', env, cwd });
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const npmRoot = path.join(fixtures, 'npm-root-app.json');
const pnpmRoot = path.join(fixtures, 'pnpm-root-app.json');

// { fixture, cmd, cwd?, exit, stderr? (regex the stderr must match when blocked) }
const cases = [
  // ---- npm-root fixture: dev/deploy config-required, config use allowed, theme dev from root blocked
  { fixture: npmRoot, cmd: 'shopify app deploy', exit: 2, stderr: /app deploy without --config/ },
  { fixture: npmRoot, cmd: 'npx shopify app deploy', exit: 2, stderr: /app deploy without --config/ },
  { fixture: npmRoot, cmd: 'npx shopify app dev --store x', exit: 2, stderr: /app dev without --config/ },
  { fixture: npmRoot, cmd: 'npm run deploy', exit: 2, stderr: /npm run deploy expands to a bare shopify app deploy/ },
  { fixture: npmRoot, cmd: 'shopify theme dev --theme 123', exit: 2, stderr: /theme dev from the repo root/ },
  { fixture: npmRoot, cmd: 'npx shopify theme dev', exit: 2, stderr: /theme dev from the repo root/ },
  { fixture: npmRoot, cmd: 'cd "$scratch" && shopify theme dev', exit: 2, stderr: /cannot be read from a literal path/ },
  { fixture: npmRoot, cmd: 'cd web && shopify theme dev --path ..', exit: 2, stderr: /theme dev from the repo root/ },
  { fixture: npmRoot, cmd: 'npx shopify app deploy --config example-dev', exit: 2, stderr: /wrong config .*expects example\b/ },
  { fixture: npmRoot, cmd: 'npx shopify app dev --config example', exit: 2, stderr: /wrong config .*expects example-dev/ },
  { fixture: npmRoot, cmd: 'shopify app deploy -c=example-dev', exit: 2, stderr: /wrong config/ },
  { fixture: npmRoot, cmd: 'git status && npx shopify app deploy', exit: 2, stderr: /app deploy without --config/ },
  { fixture: npmRoot, cmd: 'echo hi; npm run deploy', exit: 2, stderr: /npm run deploy/ },
  { fixture: MISSING, cmd: 'npx shopify app deploy --config x', exit: 2, stderr: /manifest is missing or unreadable/ },
  { fixture: MISSING, cmd: 'npm run deploy', exit: 2, stderr: /manifest/ },

  { fixture: npmRoot, cmd: 'npx shopify app deploy --config example', exit: 0 },
  { fixture: npmRoot, cmd: 'npx shopify app dev --config example-dev --store x --theme-app-extension-port 26100', exit: 0 },
  { fixture: npmRoot, cmd: 'npx shopify app dev clean --config=example-dev', exit: 0 },
  { fixture: npmRoot, cmd: 'shopify app deploy -c example', exit: 0 },
  { fixture: npmRoot, cmd: 'shopify app deploy --config=example', exit: 0 },
  { fixture: npmRoot, cmd: 'shopify app build', exit: 0 },
  { fixture: npmRoot, cmd: 'shopify app config use example-dev', exit: 0 },
  { fixture: npmRoot, cmd: 'shopify theme pull', exit: 0 },
  { fixture: npmRoot, cmd: 'shopify theme dev --path /tmp/theme-scratch', exit: 0 },
  { fixture: npmRoot, cmd: 'cd /tmp/theme-scratch && shopify theme dev --theme 123', exit: 0 },
  { fixture: npmRoot, cmd: 'cd scratch && shopify theme dev --theme 123', exit: 0 },
  { fixture: npmRoot, cmd: '(cd scratch && shopify theme dev) && ls', exit: 0 },
  { fixture: npmRoot, cmd: "cat > notes.md <<'EOF'\nshopify app deploy\nnpm run deploy\nEOF", exit: 0 },
  { fixture: npmRoot, cmd: 'git commit -m "docs: mention `shopify app deploy` and `npm run deploy` in the runbook"', exit: 0 },
  { fixture: npmRoot, cmd: 'ls -la && git status', exit: 0 },
  { fixture: npmRoot, cmd: 'npm run build', exit: 0 },
  { fixture: npmRoot, cmd: 'npm run deploy:docs', exit: 0 },
  { fixture: MISSING, cmd: 'ls', exit: 0 },
  { fixture: MISSING, cmd: 'git status', exit: 0 },

  // ---- pnpm-root fixture: dev allowed, deploy operator-only, config use operator-only, theme dev allowed
  { fixture: pnpmRoot, cmd: 'npx shopify app deploy', exit: 2, stderr: /operator-only/ },
  { fixture: pnpmRoot, cmd: 'npx shopify app deploy --config anything', exit: 2, stderr: /operator-only/ },
  { fixture: pnpmRoot, cmd: 'pnpm deploy', exit: 2, stderr: /pnpm run deploy expands to shopify app deploy, which is operator-only/ },
  { fixture: pnpmRoot, cmd: 'pnpm run deploy', exit: 2, stderr: /operator-only/ },
  { fixture: pnpmRoot, cmd: 'shopify app config use foo', exit: 2, stderr: /config use is operator-only/ },
  { fixture: pnpmRoot, cmd: 'npx shopify app dev', exit: 0 },
  { fixture: pnpmRoot, cmd: 'npx shopify app dev --store x', exit: 0 },
  { fixture: pnpmRoot, cmd: 'shopify theme dev', exit: 0 },
  { fixture: pnpmRoot, cmd: 'shopify theme dev --theme 123', exit: 0 },
  { fixture: pnpmRoot, cmd: 'pnpm run build', exit: 0 },
];

describe('guard-shopify-cli.sh', () => {
  for (const c of cases) {
    const label = `${path.basename(c.fixture, '.json')} :: ${JSON.stringify(c.cmd)} -> ${c.exit}`;
    test(label, () => {
      const r = runHook('guard-shopify-cli.sh', { manifest: c.fixture, command: c.cmd, cwd: c.cwd });
      assert.equal(r.status, c.exit, `exit code; stderr: ${r.stderr}`);
      if (c.exit === 2) {
        assert.match(r.stderr, /^Blocked by shopify-app-kit\/guard-shopify-cli: /, 'block prefix');
        assert.match(r.stderr, new RegExp(`Cases: shopify-app-kit test/hooks\\.test\\.mjs \\(v${KIT_VERSION.replace(/\./g, '\\.')}\\)\\.`), 'cases line');
        if (c.stderr) assert.match(r.stderr, c.stderr, 'reason');
      } else {
        assert.equal(r.stderr, '', 'no stderr when allowed');
      }
    });
  }

  test('manifest resolves via CLAUDE_PROJECT_DIR when SHOPIFY_APP_KIT_MANIFEST is unset', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-proj-'));
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.copyFileSync(npmRoot, path.join(dir, '.claude', 'shopify-app.json'));
    const r = runHook('guard-shopify-cli.sh', { manifest: undefined, command: 'shopify app deploy', cwd: dir, extraEnv: { CLAUDE_PROJECT_DIR: dir } });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /app deploy without --config/);
    // theme dev from that root is blocked, from a subdirectory it is allowed
    fs.mkdirSync(path.join(dir, 'tmp-theme'), { recursive: true });
    assert.equal(runHook('guard-shopify-cli.sh', { manifest: undefined, command: 'shopify theme dev', cwd: dir, extraEnv: { CLAUDE_PROJECT_DIR: dir } }).status, 2);
    assert.equal(runHook('guard-shopify-cli.sh', { manifest: undefined, command: 'shopify theme dev', cwd: path.join(dir, 'tmp-theme'), extraEnv: { CLAUDE_PROJECT_DIR: dir } }).status, 0);
  });

  test('manifest resolves by walking up from cwd when no env is set', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-walk-'));
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'web', 'app'), { recursive: true });
    fs.copyFileSync(pnpmRoot, path.join(dir, '.claude', 'shopify-app.json'));
    const env = { ...process.env };
    delete env.SHOPIFY_APP_KIT_MANIFEST; delete env.CLAUDE_PROJECT_DIR; delete env.SHOPIFY_APP_KIT_ROOT;
    const payload = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npx shopify app deploy' }, cwd: path.join(dir, 'web', 'app') });
    const r = spawnSync('bash', [path.join(hooksDir, 'guard-shopify-cli.sh')], { input: payload, encoding: 'utf8', env, cwd: dir });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /operator-only/);
  });

  test('every vendorable hook carries the kit version header on line 2', () => {
    for (const f of fs.readdirSync(hooksDir).filter((n) => n.endsWith('.sh'))) {
      const lines = fs.readFileSync(path.join(hooksDir, f), 'utf8').split('\n');
      assert.match(lines[0], /^#!\/usr\/bin\/env bash$/, `${f} shebang`);
      assert.equal(lines[1], `# shopify-app-kit v${KIT_VERSION}`, `${f} header`);
    }
  });
});

describe('doctor.sh', () => {
  test('prints a briefing for a valid manifest and exits 0', () => {
    const r = runHook('doctor.sh', { manifest: npmRoot, event: 'SessionStart' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /shopify-app-kit doctor \(v\d+\.\d+\.\d+\): .*OK \(schema v1, kit\.version 0\.1\.0\)/);
    assert.match(r.stdout, /Example App \(embedded-app\)/);
    assert.match(r.stdout, /Default branch beta; protected: main; promotion beta -> main/);
    assert.match(r.stdout, /dev=example-dev deploy=example/);
    assert.match(r.stdout, /app deploy config-required/);
    assert.match(r.stdout, /\.=npm web=pnpm/);
    assert.match(r.stdout, /API version 2026-07/);
    // kit.version is set but nothing is vendored yet in the fake consumer
    assert.match(r.stdout, /Drift: .*hooks\/kit\/ does not exist/);
  });

  test('is silent without a manifest and exits 0', () => {
    const r = runHook('doctor.sh', { manifest: MISSING, event: 'SessionStart' });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
    assert.equal(r.stderr, '');
  });

  test('reports structural problems and still exits 0', () => {
    const bad = JSON.parse(fs.readFileSync(npmRoot, 'utf8'));
    bad.shopifyCli.deployPolicy = 'yolo';
    delete bad.branches.protected;
    bad.apiVersion.expected = '2026-05';
    const p = path.join(consumer, 'bad-manifest.json');
    fs.writeFileSync(p, JSON.stringify(bad));
    const r = runHook('doctor.sh', { manifest: p, event: 'SessionStart' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /does not satisfy schema v1/);
    assert.match(r.stdout, /- shopifyCli\.deployPolicy must be one of/);
    assert.match(r.stdout, /- branches\.protected must be a non-empty array/);
    assert.match(r.stdout, /- apiVersion\.expected must look like/);
  });

  test('reports vendored hook drift against kit.version', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-drift-'));
    fs.mkdirSync(path.join(dir, '.claude', 'hooks', 'kit'), { recursive: true });
    fs.copyFileSync(npmRoot, path.join(dir, '.claude', 'shopify-app.json'));
    fs.writeFileSync(path.join(dir, '.claude', 'hooks', 'kit', 'guard-shopify-cli.sh'), '#!/usr/bin/env bash\n# shopify-app-kit v0.0.9\nexit 0\n');
    fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), '{}');
    const r = runHook('doctor.sh', { manifest: undefined, event: 'SessionStart', cwd: dir, extraEnv: { CLAUDE_PROJECT_DIR: dir } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Drift: guard-shopify-cli\.sh is v0\.0\.9 but the manifest's kit\.version is 0\.1\.0/);
    assert.match(r.stdout, /Drift: \.claude\/settings\.json does not register/);
  });
});

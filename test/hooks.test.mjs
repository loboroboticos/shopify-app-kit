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

// ---------------------------------------------------------------------------------------------- guard-protected-branch
// A fake gh on PATH answers `gh pr view <sel> [-R repo] --json baseRefName --jq .baseRefName` with $FAKE_GH_BASE.
const fakeBin = path.join(consumer, 'fakebin');
fs.mkdirSync(fakeBin, { recursive: true });
fs.writeFileSync(path.join(fakeBin, 'gh'), "#!/usr/bin/env bash\ncase \" $* \" in *' pr view '*' --json baseRefName '*) printf '%s\\n' \"${FAKE_GH_BASE:-}\" ;; *) exit 1 ;; esac\n", { mode: 0o755 });
// Workflow files whose display names the guard reads from <consumer root>/.github/workflows/<file>.
fs.mkdirSync(path.join(consumer, '.github', 'workflows'), { recursive: true });
fs.writeFileSync(path.join(consumer, '.github', 'workflows', 'deploy.yml'), 'name: Deploy\non: workflow_dispatch\n');
fs.writeFileSync(path.join(consumer, '.github', 'workflows', 'shopify-deploy.yml'), 'name: "Shopify Deploy"\non: workflow_dispatch\n');
fs.writeFileSync(path.join(consumer, '.github', 'workflows', 'qa.yml'), 'name: QA\non: workflow_dispatch\n');
// Throwaway checkouts on a protected and on the default branch (implicit pushes).
const onMain = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-on-main-'));
const onBeta = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-on-beta-'));
spawnSync('git', ['init', '-q', '-b', 'main', onMain]);
spawnSync('git', ['init', '-q', '-b', 'beta', onBeta]);
const releaseTrain = path.join(fixtures, 'release-train-app.json');

function runGuard(hook, c) {
  const extraEnv = { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}`, FAKE_GH_BASE: c.base ?? '' };
  return runHook(hook, { manifest: c.fixture, command: c.cmd, cwd: c.cwd, extraEnv });
}

function assertCase(hook, name, c) {
  const r = runGuard(hook, c);
  assert.equal(r.status, c.exit, `exit code; stderr: ${r.stderr}`);
  if (c.exit === 2) {
    assert.match(r.stderr, new RegExp(`^Blocked by shopify-app-kit\\/${name}: `), 'block prefix');
    assert.match(r.stderr, new RegExp(`Cases: shopify-app-kit test/hooks\\.test\\.mjs \\(v${KIT_VERSION.replace(/\./g, '\\.')}\\)\\.`), 'cases line');
    if (c.stderr) assert.match(r.stderr, c.stderr, 'reason');
  } else {
    assert.equal(r.stderr, '', 'no stderr when allowed');
  }
}

// { fixture, cmd, cwd?, base? ($FAKE_GH_BASE), exit, stderr? }
const protectedCases = [
  // ---- npm-root fixture: protected main, default beta, promotion beta -> main, deploy.yml + shopify-deploy.yml protected
  { fixture: npmRoot, cmd: 'git push origin main', exit: 2, stderr: /push to a protected branch \(main\)/ },
  { fixture: npmRoot, cmd: 'git push origin HEAD:main', exit: 2, stderr: /protected branch \(HEAD:main\)/ },
  { fixture: npmRoot, cmd: 'git push origin beta:refs/heads/main', exit: 2, stderr: /protected branch/ },
  { fixture: npmRoot, cmd: 'git push -f origin +main', exit: 2, stderr: /protected branch \(main\)/ },
  { fixture: npmRoot, cmd: 'git push origin :main', exit: 2, stderr: /protected branch/ },
  { fixture: npmRoot, cmd: 'git push --all origin', exit: 2, stderr: /--all pushes main along with every other branch/ },
  { fixture: npmRoot, cmd: 'git push --mirror origin', exit: 2, stderr: /--mirror pushes main/ },
  { fixture: npmRoot, cmd: 'git push', cwd: onMain, exit: 2, stderr: /no refspec from a checkout on a protected branch/ },
  { fixture: npmRoot, cmd: 'git push origin HEAD', cwd: onMain, exit: 2, stderr: /push HEAD from a checkout on a protected branch/ },
  { fixture: npmRoot, cmd: `git -C ${onMain} push`, exit: 2, stderr: /no refspec from a checkout on a protected branch/ },
  { fixture: npmRoot, cmd: `cd ${onMain} && git push`, exit: 2, stderr: /checkout on a protected branch/ },
  { fixture: npmRoot, cmd: 'cd "$dir" && git push', exit: 2, stderr: /cannot be read from a literal path/ },
  { fixture: npmRoot, cmd: 'git status && git push origin main', exit: 2, stderr: /protected branch/ },
  { fixture: npmRoot, cmd: 'gh pr merge 12 --squash', base: 'main', exit: 2, stderr: /gh pr merge 12 merges into main/ },
  { fixture: npmRoot, cmd: 'gh pr merge 12 --squash', base: '', exit: 2, stderr: /base branch could not be resolved/ },
  { fixture: npmRoot, cmd: 'gh pr merge --auto -R o/r 12', base: 'main', exit: 2, stderr: /merges into main/ },
  { fixture: npmRoot, cmd: 'gh pr edit 12 --base main', exit: 2, stderr: /retargets a PR at a protected branch/ },
  { fixture: npmRoot, cmd: 'gh pr edit 12 --base=main', exit: 2, stderr: /retargets a PR at a protected branch/ },
  { fixture: npmRoot, cmd: 'gh workflow run deploy.yml', exit: 2, stderr: /production deploy \(deploy\.yml\)/ },
  { fixture: npmRoot, cmd: 'gh workflow run .github/workflows/shopify-deploy.yml -f dump=true', exit: 2, stderr: /production deploy/ },
  { fixture: npmRoot, cmd: 'gh workflow run "Shopify Deploy"', exit: 2, stderr: /production deploy \(Shopify Deploy\)/ },
  { fixture: npmRoot, cmd: 'gh workflow run Deploy --ref main', exit: 2, stderr: /production deploy \(Deploy\)/ },
  { fixture: npmRoot, cmd: 'gh api -X PUT repos/o/r/git/refs/heads/main -f sha=abc', exit: 2, stderr: /write to git\/refs\/heads\/main/ },
  { fixture: npmRoot, cmd: 'gh api --method=patch repos/o/r/git/refs/heads/main --input body.json', exit: 2, stderr: /write to git\/refs\/heads\/main/ },
  { fixture: npmRoot, cmd: 'gh api repos/o/r/merges -f base=main -f head=beta', exit: 2, stderr: /\/merges into main/ },
  { fixture: npmRoot, cmd: "gh api graphql -f query='mutation { mergePullRequest(input: {}) { clientMutationId } }'", exit: 2, stderr: /mergePullRequest/ },
  { fixture: npmRoot, cmd: 'gh api -X PUT repos/o/r/pulls/12/merge', base: 'main', exit: 2, stderr: /merge of PR #12 into main/ },
  { fixture: npmRoot, cmd: 'gh api -X PUT repos/o/r/pulls/12/merge', base: '', exit: 2, stderr: /could not be resolved/ },
  { fixture: MISSING, cmd: 'git push origin beta', exit: 2, stderr: /manifest is missing or unreadable/ },
  { fixture: MISSING, cmd: 'gh pr merge 12', exit: 2, stderr: /manifest/ },

  { fixture: npmRoot, cmd: 'git push -u origin beta', exit: 0 },
  { fixture: npmRoot, cmd: 'git push origin claude/some-branch', exit: 0 },
  { fixture: npmRoot, cmd: 'git push origin HEAD:refs/heads/feature', exit: 0 },
  { fixture: npmRoot, cmd: 'git push --force-with-lease origin beta', exit: 0 },
  { fixture: npmRoot, cmd: 'git push', cwd: onBeta, exit: 0 },
  { fixture: npmRoot, cmd: 'git push origin HEAD', cwd: onBeta, exit: 0 },
  { fixture: npmRoot, cmd: `git -C ${onBeta} push`, exit: 0 },
  { fixture: npmRoot, cmd: 'git status && git log --oneline -3', exit: 0 },
  { fixture: npmRoot, cmd: "git commit -m 'push main later'", exit: 0 },
  { fixture: npmRoot, cmd: 'git checkout main && git pull', exit: 0 },
  { fixture: npmRoot, cmd: 'gh pr merge 12 --squash', base: 'beta', exit: 0 },
  { fixture: npmRoot, cmd: "gh pr create --base main --head beta --title 'Promote beta'", exit: 0 },
  { fixture: npmRoot, cmd: 'gh pr edit 12 --base beta', exit: 0 },
  { fixture: npmRoot, cmd: 'gh pr view 12 --json baseRefName', exit: 0 },
  { fixture: npmRoot, cmd: 'gh workflow run qa.yml -f suite=v3', exit: 0 },
  { fixture: npmRoot, cmd: 'gh workflow run deploy-beta.yml', exit: 0 },
  { fixture: npmRoot, cmd: 'gh workflow run QA', exit: 0 },
  { fixture: npmRoot, cmd: 'gh api repos/o/r/git/refs/heads/main', exit: 0 },
  { fixture: npmRoot, cmd: 'gh api repos/o/r/pulls/12', exit: 0 },
  // any method against pulls/<n>/merge is treated as a merge attempt (fail closed), like the donor guard
  { fixture: npmRoot, cmd: 'gh api repos/o/r/pulls/12/merge', base: 'main', exit: 2, stderr: /merge of PR #12 into main/ },
  { fixture: npmRoot, cmd: 'gh api repos/o/r/merges -f base=beta -f head=feature', exit: 0 },
  { fixture: npmRoot, cmd: "cat > notes.md <<'EOF'\ngit push origin main\ngh pr merge 12\nEOF", exit: 0 },
  { fixture: MISSING, cmd: 'ls', exit: 0 },
  { fixture: MISSING, cmd: 'npm test', exit: 0 },

  // ---- release-train fixture: protected main + release, default develop, fly-deploy.yml protected
  { fixture: releaseTrain, cmd: 'git push origin release', exit: 2, stderr: /ships to main, release\. Target develop instead/ },
  { fixture: releaseTrain, cmd: 'git push origin main', exit: 2, stderr: /Target develop instead; Claude may open a release -> main promotion PR/ },
  { fixture: releaseTrain, cmd: 'gh workflow run fly-deploy.yml', exit: 2, stderr: /production deploy \(fly-deploy\.yml\)/ },
  { fixture: releaseTrain, cmd: 'git push origin develop', exit: 0 },
  { fixture: releaseTrain, cmd: 'gh workflow run deploy.yml', exit: 0 },

  // ---- pnpm-root fixture: promotion null
  { fixture: pnpmRoot, cmd: 'git push origin main', exit: 2, stderr: /Only the maintainer ships to main\./ },
  { fixture: pnpmRoot, cmd: 'git push origin feature/x', exit: 0 },
];

describe('guard-protected-branch.sh', () => {
  for (const c of protectedCases) {
    const label = `${path.basename(c.fixture, '.json')} :: ${JSON.stringify(c.cmd)}${c.base !== undefined ? ` [base=${c.base || '<none>'}]` : ''} -> ${c.exit}`;
    test(label, () => assertCase('guard-protected-branch.sh', 'guard-protected-branch', c));
  }

  test('the throwaway checkouts really are on main and beta', () => {
    assert.equal(spawnSync('git', ['-C', onMain, 'symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), 'main');
    assert.equal(spawnSync('git', ['-C', onBeta, 'symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8' }).stdout.trim(), 'beta');
  });

  test('a manifest with an empty branches.protected fails closed', () => {
    const m = JSON.parse(fs.readFileSync(npmRoot, 'utf8'));
    m.branches.protected = [];
    const p = path.join(consumer, 'unprotected-manifest.json');
    fs.writeFileSync(p, JSON.stringify(m));
    const r = runGuard('guard-protected-branch.sh', { fixture: p, cmd: 'git push origin beta' });
    assert.equal(r.status, 2, r.stderr);
    assert.match(r.stderr, /manifest is missing or unreadable/);
  });
});

// ---------------------------------------------------------------------------------------------- guard-package-manager
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'shopify-app-kit-outside-'));

const pmCases = [
  // ---- npm-root fixture: { ".": "npm", "web": "pnpm" }
  { fixture: npmRoot, cmd: 'pnpm install', exit: 2, stderr: /pnpm in a directory the manifest maps to npm \(\.: pnpm install\)/ },
  { fixture: npmRoot, cmd: 'pnpm test', cwd: consumer, exit: 2, stderr: /maps to npm/ },
  { fixture: npmRoot, cmd: 'pnpm add -D vitest', exit: 2, stderr: /maps to npm \(\.: pnpm add -D vitest\)/ },
  { fixture: npmRoot, cmd: 'cd "$dir" && pnpm install', exit: 2, stderr: /cannot be read from a literal path/ },
  { fixture: npmRoot, cmd: 'cd - && pnpm install', exit: 2, stderr: /cannot be read from a literal path/ },
  { fixture: npmRoot, cmd: '(cd web && pnpm test) && pnpm install', exit: 2, stderr: /maps to npm \(\.: pnpm install\)/ },
  { fixture: npmRoot, cmd: 'cd web && cd .. && pnpm install', exit: 2, stderr: /maps to npm/ },
  { fixture: npmRoot, cmd: 'pnpm -C .. install', cwd: path.join(consumer, 'web'), exit: 2, stderr: /maps to npm/ },
  { fixture: npmRoot, cmd: `pnpm -C ${consumer} install`, cwd: path.join(consumer, 'web'), exit: 2, stderr: /maps to npm/ },
  { fixture: npmRoot, cmd: 'pnpm --dir .. install', cwd: path.join(consumer, 'web'), exit: 2, stderr: /maps to npm/ },
  { fixture: npmRoot, cmd: 'npm install', cwd: path.join(consumer, 'web'), exit: 2, stderr: /npm in a directory the manifest maps to pnpm \(web: npm install\)/ },
  { fixture: npmRoot, cmd: 'npm install', cwd: path.join(consumer, 'web'), exit: 2, stderr: /Use pnpm in web/ },
  { fixture: npmRoot, cmd: 'cd web && npm run build', exit: 2, stderr: /maps to pnpm \(web: npm run build\)/ },
  { fixture: npmRoot, cmd: 'npm ci --prefix web', exit: 2, stderr: /maps to pnpm/ },
  { fixture: npmRoot, cmd: 'echo hi; pnpm install', exit: 2, stderr: /maps to npm/ },
  { fixture: MISSING, cmd: 'pnpm install', exit: 2, stderr: /manifest is missing or unreadable/ },
  { fixture: MISSING, cmd: 'npm install', exit: 2, stderr: /manifest/ },

  { fixture: npmRoot, cmd: 'cd web && pnpm test', exit: 0 },
  { fixture: npmRoot, cmd: 'pnpm typecheck', cwd: path.join(consumer, 'web'), exit: 0 },
  { fixture: npmRoot, cmd: 'pnpm -C web test', exit: 0 },
  { fixture: npmRoot, cmd: 'pnpm --dir web test', exit: 0 },
  { fixture: npmRoot, cmd: 'pnpm --dir=web install', exit: 0 },
  { fixture: npmRoot, cmd: 'pushd web && pnpm install && popd', exit: 0 },
  { fixture: npmRoot, cmd: 'pnpm install', cwd: outside, exit: 0 },
  { fixture: npmRoot, cmd: 'pnpm install', cwd: path.join(consumer, 'scratch'), exit: 0 },
  { fixture: npmRoot, cmd: 'npm install', exit: 0 },
  { fixture: npmRoot, cmd: 'npm run test:storefront', exit: 0 },
  { fixture: npmRoot, cmd: 'npm ci && npm test', exit: 0 },
  { fixture: npmRoot, cmd: 'npx something', exit: 0 },
  { fixture: npmRoot, cmd: 'npx something', cwd: path.join(consumer, 'web'), exit: 0 },
  { fixture: npmRoot, cmd: 'npx prisma migrate dev', cwd: path.join(consumer, 'web'), exit: 0 },
  { fixture: npmRoot, cmd: 'npm --version', cwd: path.join(consumer, 'web'), exit: 0 },
  { fixture: npmRoot, cmd: "cat > notes.md <<'EOF'\npnpm install\nEOF", exit: 0 },
  { fixture: npmRoot, cmd: 'git commit -m "docs: run `pnpm install` in web and `npm install` at the root"', exit: 0 },
  { fixture: npmRoot, cmd: 'ls -la && git status', exit: 0 },
  { fixture: MISSING, cmd: 'ls', exit: 0 },
  { fixture: MISSING, cmd: 'git commit -m "mention npm"', exit: 0 },

  // ---- pnpm-root fixture: { ".": "pnpm" }
  { fixture: pnpmRoot, cmd: 'npm install', exit: 2, stderr: /npm in a directory the manifest maps to pnpm \(\.: npm install\)/ },
  { fixture: pnpmRoot, cmd: 'npm ci', exit: 2, stderr: /maps to pnpm/ },
  { fixture: pnpmRoot, cmd: 'npm i lodash', exit: 2, stderr: /maps to pnpm/ },
  { fixture: pnpmRoot, cmd: 'pnpm install', exit: 0 },
  { fixture: pnpmRoot, cmd: 'pnpm run build', exit: 0 },
  { fixture: pnpmRoot, cmd: 'npx shopify app dev', exit: 0 },
  { fixture: pnpmRoot, cmd: 'npm install', cwd: path.join(consumer, 'web'), exit: 0 },
];

describe('guard-package-manager.sh', () => {
  for (const c of pmCases) {
    const label = `${path.basename(c.fixture, '.json')} :: ${JSON.stringify(c.cmd)}${c.cwd ? ` @${path.relative(consumer, c.cwd) || '.'}` : ''} -> ${c.exit}`;
    test(label, () => assertCase('guard-package-manager.sh', 'guard-package-manager', c));
  }
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

  test('accepts $schema and $comment without reporting unknown top-level keys', () => {
    const r = runHook('doctor.sh', { manifest: path.join(fixtures, 'annotated-app.json'), event: 'SessionStart' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /shopify-app-kit doctor \(v\d+\.\d+\.\d+\): .*OK \(schema v1, kit\.version 0\.1\.0\)/);
    assert.doesNotMatch(r.stdout, /unknown top-level key/);
    assert.doesNotMatch(r.stdout, /does not satisfy schema v1/);
  });

  test('still reports an unrelated unknown top-level key', () => {
    const m = JSON.parse(fs.readFileSync(path.join(fixtures, 'annotated-app.json'), 'utf8'));
    m.$notes = 'x';
    const p = path.join(consumer, 'unknown-key-manifest.json');
    fs.writeFileSync(p, JSON.stringify(m));
    const r = runHook('doctor.sh', { manifest: p, event: 'SessionStart' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /does not satisfy schema v1/);
    assert.match(r.stdout, /- unknown top-level key: \$notes/);
    assert.doesNotMatch(r.stdout, /unknown top-level key: \$(schema|comment)/);
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

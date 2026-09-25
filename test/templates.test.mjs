// templates/ is the repo shell a new app starts from. Every template is listed in templates/README.md, every
// placeholder it uses is in the README's documented list, the starter manifest validates against the schema
// once the placeholders are substituted, JSON files parse, YAML files pass a structural check (no dependencies),
// scripts pass a syntax check, every file carries its header comment, the rule seeds and CLAUDE.md stay short,
// and no repo literal appears (test/no-repo-literals.test.mjs walks templates/ too; this file re-asserts it on
// the substituted manifest).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { schema, validate } from './lib/schema-validate.mjs';
import { kitRoot, walk } from './lib/fs.mjs';
import { PLACEHOLDER } from './lib/kit.mjs';

const templatesDir = path.join(kitRoot, 'templates');
const readme = fs.readFileSync(path.join(templatesDir, 'README.md'), 'utf8');

const SUBSTITUTIONS = {
  APP_NAME: 'Example App',
  DEFAULT_BRANCH: 'main',
  PROTECTED_BRANCH: 'main',
  PACKAGE_MANAGER: 'npm',
  SERVER_DIR: '.',
  GITLEAKS_VERSION: '8.24.3',
  GITLEAKS_SHA256: 'a'.repeat(64),
};
const MAX_RULE_LINES = 25;
const MAX_CLAUDE_MD_LINES = 60;

const files = [...walk(templatesDir)].map((f) => path.relative(templatesDir, f).split(path.sep).join('/')).filter((f) => f !== 'README.md').sort();
const read = (f) => fs.readFileSync(path.join(templatesDir, f), 'utf8');
const substitute = (text) => text.replace(PLACEHOLDER, (m, k) => SUBSTITUTIONS[k] ?? m);
const lineCount = (text) => text.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === '')).length;

// Structural YAML check, enough for the files here: no tabs, two-space indentation, every line outside a
// block scalar is a comment, a key, a list item or a flow continuation, and the indentation never jumps by
// more than one level except into a list item's nested mapping.
function checkYaml(text, file) {
  const lines = text.split(/\r?\n/);
  let blockIndent = -1; // inside a | or > scalar while indentation exceeds this
  let prevIndent = 0;
  lines.forEach((raw, i) => {
    const n = i + 1;
    assert.ok(!raw.includes('\t'), `${file}:${n} uses a tab`);
    if (raw.trim() === '') return;
    const indent = raw.match(/^ */)[0].length;
    if (blockIndent >= 0) {
      if (indent > blockIndent) return;
      blockIndent = -1;
    }
    const line = raw.trim();
    if (line.startsWith('#')) return;
    assert.equal(indent % 2, 0, `${file}:${n} indentation is not a multiple of two`);
    assert.ok(indent <= prevIndent + 4, `${file}:${n} indentation jumps by more than two levels`);
    const key = line.match(/^(- )?(?:'[^']*'|"[^"]*"|[A-Za-z0-9_.$@{}\[\]\/-]+):(?: |$)(.*)$/);
    const item = line.match(/^- (.*)$/);
    assert.ok(key || item || /^[-\w]/.test(line), `${file}:${n} is not a key, list item or scalar: ${line}`);
    const value = key ? key[2] : item ? item[1] : '';
    // An unquoted {{PLACEHOLDER}} at the start of a value (or inside a flow sequence) is a YAML flow mapping,
    // so the raw template would not parse; block scalars (| and >) are exempt because their content is literal.
    assert.ok(!/(^|[\[,] ?)\{\{[A-Z_]+\}\}/.test(value), `${file}:${n} has an unquoted placeholder in value position; quote it`);
    if (/^[|>][-+]?$/.test(value.trim())) blockIndent = indent;
    for (const q of ['"', "'"]) {
      const count = (line.match(new RegExp(q, 'g')) ?? []).length;
      if (!line.includes('#')) assert.equal(count % 2, 0, `${file}:${n} has an unbalanced ${q}`);
    }
    prevIndent = indent;
  });
}

describe('templates/', () => {
  test('there are templates', () => assert.ok(files.length >= 20, `${files.length} files`));

  test('every template is listed in templates/README.md', () => {
    const missing = files.filter((f) => !readme.includes(`\`${f}\``));
    assert.deepEqual(missing, [], `add a row to the Files table of templates/README.md for each of:\n${missing.join('\n')}`);
  });

  test('every row of templates/README.md names a file that exists', () => {
    const named = [...readme.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]).filter((f) => !f.startsWith('{{'));
    const gone = named.filter((f) => !files.includes(f));
    assert.deepEqual(gone, [], `templates/README.md names templates that do not exist:\n${gone.join('\n')}`);
  });

  test('every placeholder used is documented in templates/README.md', () => {
    const documented = new Set([...readme.matchAll(/^\| `\{\{([A-Z][A-Z0-9_]*)\}\}` \|/gm)].map((m) => m[1]));
    assert.ok(documented.size >= 5, 'the README documents the placeholders');
    const undocumented = [];
    for (const f of files) {
      for (const m of read(f).matchAll(PLACEHOLDER)) if (!documented.has(m[1])) undocumented.push(`${f}: {{${m[1]}}}`);
    }
    assert.deepEqual([...new Set(undocumented)], [], 'add each placeholder to the Placeholders table of templates/README.md');
    for (const p of documented) assert.ok(p in SUBSTITUTIONS, `test/templates.test.mjs has no substitution for {{${p}}}`);
  });

  test('every documented placeholder is used by at least one template', () => {
    const documented = [...readme.matchAll(/^\| `\{\{([A-Z][A-Z0-9_]*)\}\}` \|/gm)].map((m) => m[1]);
    const used = new Set(files.flatMap((f) => [...read(f).matchAll(PLACEHOLDER)].map((m) => m[1])));
    assert.deepEqual(documented.filter((p) => !used.has(p)), [], 'a documented placeholder that no template uses');
  });

  test('every template carries its header comment naming itself', () => {
    const bare = files.filter((f) => !read(f).slice(0, 1200).includes(path.basename(f)));
    assert.deepEqual(bare, [], 'each template starts with a comment that names the file and what it reads or which test guards it');
  });

  test('the starter manifest validates against the schema after substitution', () => {
    const m = JSON.parse(substitute(read('.claude/shopify-app.json')));
    assert.deepEqual(validate(m, schema), []);
    assert.equal(m.auth.expiringOfflineTokens, true);
    assert.equal(m.billing.method, 'app-pricing');
    assert.deepEqual(m.database, { provider: 'supabase', rls: true });
    assert.equal(m.app.name, 'Example App');
    assert.deepEqual(m.packageManagers, { '.': 'npm' });
    assert.equal(m.kit.version, null);
    for (const handle of Object.values(m.app.handles)) assert.match(handle, /^example/);
  });

  test('the starter manifest carries no unsubstituted placeholder after substitution', () => {
    assert.equal(substitute(read('.claude/shopify-app.json')).match(PLACEHOLDER), null);
  });

  test('JSON templates parse before and after substitution', () => {
    for (const f of files.filter((x) => x.endsWith('.json'))) {
      assert.doesNotThrow(() => JSON.parse(read(f)), `${f} parses as JSON`);
      assert.doesNotThrow(() => JSON.parse(substitute(read(f))), `${f} parses as JSON after substitution`);
    }
  });

  test('settings.json pins the kit marketplace and registers the guards and the bootstrap hook', () => {
    const s = JSON.parse(read('.claude/settings.json'));
    assert.equal(s.extraKnownMarketplaces['shopify-app-kit'].source.repo, 'loboroboticos/shopify-app-kit');
    assert.equal(s.enabledPlugins['shopify-app-kit@shopify-app-kit'], true);
    const pre = s.hooks.PreToolUse.flatMap((h) => h.hooks.map((x) => x.command)).join('\n');
    // Every guard the kit ships is registered, and nothing else is.
    const shipped = fs.readdirSync(path.join(kitRoot, 'hooks')).filter((n) => /^guard-.*\.sh$/.test(n)).sort();
    assert.deepEqual(shipped, ['guard-migrations.sh', 'guard-package-manager.sh', 'guard-protected-branch.sh', 'guard-shopify-cli.sh']);
    for (const g of shipped) assert.ok(pre.includes(`hooks/kit/${g}`), g);
    const registered = [...pre.matchAll(/hooks\/kit\/(guard-[a-z-]+\.sh)/g)].map((m) => m[1]).sort();
    assert.deepEqual(registered, shipped, 'settings.json registers exactly the guards under hooks/');
    assert.ok(s.hooks.SessionStart.flatMap((h) => h.hooks.map((x) => x.command)).some((c) => c.includes('kit-bootstrap.sh')));
  });

  test('YAML templates pass the structural check before and after substitution', () => {
    const yaml = files.filter((x) => /\.ya?ml$/.test(x));
    assert.ok(yaml.length >= 5, 'yaml templates present');
    for (const f of yaml) {
      checkYaml(read(f), f);
      checkYaml(substitute(read(f)), `${f} (substituted)`);
    }
  });

  test('workflows use least privilege, SHA-pinned actions and off-the-hour crons', () => {
    const workflows = files.filter((x) => x.startsWith('.github/workflows/'));
    assert.ok(workflows.length >= 3);
    const minutes = new Set();
    for (const f of workflows) {
      const text = read(f);
      assert.match(text, /^permissions:\n  contents: read/m, `${f} starts its permissions block with contents: read`);
      assert.match(text, /^concurrency:\n  group: /m, `${f} declares a concurrency group`);
      for (const m of text.matchAll(/uses: ([^\s]+)/g)) {
        if (m[1].startsWith('./')) continue;
        assert.match(m[1], /@[0-9a-f]{40}$/, `${f}: ${m[1]} is not pinned by commit SHA`);
      }
      for (const m of text.matchAll(/- cron: '(\d+) /g)) {
        assert.notEqual(m[1], '0', `${f}: cron minute must be off the hour`);
        assert.ok(!minutes.has(m[1]), `${f}: cron minute ${m[1]} is shared with another schedule`);
        minutes.add(m[1]);
      }
      if (text.includes('schedule:')) assert.match(text, /60 days/, `${f}: a scheduled workflow says the platform disables it after 60 days of inactivity`);
    }
  });

  test('ci.yml rehearses migrations from empty and diffs against the schema', () => {
    const text = read('.github/workflows/ci.yml');
    assert.match(text, /workflow_call:/);
    assert.match(text, /prisma migrate deploy/);
    assert.match(text, /prisma migrate diff[\s\S]*--from-url "\$DATABASE_URL"[\s\S]*--to-schema-datamodel[\s\S]*--exit-code/);
    assert.match(text, /--audit-level=high/);
    assert.match(text, /image: postgres/);
  });

  test('secret-scan.yml verifies a pinned checksum and redacts', () => {
    const text = read('.github/workflows/secret-scan.yml');
    assert.match(text, /fetch-depth: 0/);
    assert.match(text, /sha256sum -c/);
    assert.match(text, /\{\{GITLEAKS_VERSION\}\}/);
    assert.match(text, /\{\{GITLEAKS_SHA256\}\}/);
    assert.match(text, /--redact/);
    assert.doesNotMatch(text, /uses: gitleaks\//, 'the binary, not the licensed action');
  });

  test('.gitleaks.toml extends the defaults and has a credentialed-URI rule with reasons on every allowlist entry', () => {
    const text = read('.gitleaks.toml');
    assert.match(text, /\[extend\]\n(#.*\n)*useDefault = true/);
    assert.match(text, /id = "connection-uri-with-credentials"/);
    for (const scheme of ['postgres', 'mysql', 'mongodb', 'redis', 'amqp']) assert.ok(text.includes(scheme), scheme);
    // Every allowlist entry (a quoted path or regex inside a paths/regexes list) is preceded by a comment.
    const lines = text.split(/\r?\n/);
    lines.forEach((l, i) => {
      if (/^\s*'''.*''',?$/.test(l)) assert.match(lines[i - 1], /^\s*#/, `.gitleaks.toml:${i + 1} allowlist entry has no reason above it`);
    });
  });

  test('dependabot.yml groups minor and patch and ignores the framework majors', () => {
    const text = read('.github/dependabot.yml');
    for (const eco of ['github-actions', 'npm', 'docker']) assert.ok(text.includes(`package-ecosystem: ${eco}`), eco);
    assert.match(text, /update-types: \[minor, patch\]/);
    for (const dep of ['@shopify/shopify-app-react-router', '@shopify/shopify-api', '@shopify/shopify-app-session-storage-prisma', 'prisma', '@prisma/client', 'react-router', '@react-router/*', 'typescript']) {
      assert.ok(text.includes(`dependency-name: ${dep.includes('@') ? `'${dep}'` : dep}`), dep);
    }
  });

  test('the work-item issue template carries every executor rung and the irreversibility check', () => {
    const text = read('.github/ISSUE_TEMPLATE/work-item.md');
    for (const rung of ['code only', '`agent:ci`', '`agent:cloud`', '`agent:local`', 'Bootstrap: #__', '`human:decision`', '`human:account`', '`human:legal`']) {
      assert.ok(text.includes(rung), rung);
    }
    assert.match(text, /more than one group\? Split/);
    assert.match(text, /## Irreversibility check/);
    assert.match(text, /real charge/);
  });

  test('.env.example holds placeholders only and marks every variable', () => {
    const text = read('.env.example');
    const assignments = text.split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l));
    assert.ok(assignments.length >= 8);
    for (const a of assignments) {
      const [, value] = a.split('=');
      assert.ok(value === '' || /^<[^>]+>$/.test(value) || /^(true|false|development|read_[a-z_,]+|https:\/\/[a-z.-]*example\.com|postgresql:\/\/<[^>]+>:<[^>]+>@localhost[^ ]*)$/.test(value), `${a}: not a placeholder`);
    }
    for (const marker of ['PUBLIC', 'SECRET', 'LOCAL']) assert.ok(text.includes(`# ${marker}.`), marker);
    assert.match(text, /DIRECT_DATABASE_URL=/);
    assert.match(text, /DEV_DATABASE_FINGERPRINT=/);
    assert.match(text, /@localhost/);
  });

  test('scripts pass a syntax check', () => {
    for (const f of files.filter((x) => x.endsWith('.sh'))) {
      const r = spawnSync('bash', ['-n', path.join(templatesDir, f)], { encoding: 'utf8' });
      assert.equal(r.status, 0, `${f}: ${r.stderr}`);
      assert.match(read(f), /^#!\/usr\/bin\/env bash/, `${f} has a bash shebang`);
    }
    for (const f of files.filter((x) => x.endsWith('.mjs'))) {
      const r = spawnSync(process.execPath, ['--check', path.join(templatesDir, f)], { encoding: 'utf8' });
      assert.equal(r.status, 0, `${f}: ${r.stderr}`);
    }
  });

  test('kit-bootstrap.sh is remote-only, installs both plugins and graphify at the doctor\'s pin, writes the opt-out and never fails the session', () => {
    const text = read('.claude/hooks/kit-bootstrap.sh');
    assert.match(text, /CLAUDE_CODE_REMOTE/);
    assert.match(text, /claude plugin marketplace add loboroboticos\/shopify-app-kit/);
    assert.match(text, /claude plugin install shopify-app-kit@shopify-app-kit/);
    assert.match(text, /claude plugin install shopify-ai-toolkit@claude-plugins-official/);
    assert.match(text, /\.config\/shopify-ai-toolkit\/opt-out/);
    assert.match(text, /^exit 0$/m);
    assert.doesNotMatch(text, /set -e/);
    // graphify: a pip package (graphifyy) plus `graphify install`, pinned to the same release the doctor names.
    const pin = text.match(/^GRAPHIFY_VERSION="(\d+\.\d+\.\d+)"$/m)?.[1];
    assert.ok(pin, 'GRAPHIFY_VERSION="X.Y.Z" is set');
    assert.equal(pin, fs.readFileSync(path.join(kitRoot, 'hooks', 'doctor.sh'), 'utf8').match(/^GRAPHIFY_VERSION="([^"]+)"$/m)[1], 'the bootstrap and the doctor pin the same graphify release');
    assert.match(text, /pip install --quiet "graphifyy==\$GRAPHIFY_VERSION"/);
    assert.match(text, /uv tool install "graphifyy==\$GRAPHIFY_VERSION"/);
    assert.match(text, /pipx install "graphifyy==\$GRAPHIFY_VERSION"/);
    assert.match(text, /graphify install >\/dev\/null/);
    assert.match(text, /command -v graphify/);
    assert.match(text, /skills\/graphify\/SKILL\.md/);
    assert.doesNotMatch(text, /claude plugin install graphify/, 'graphify is not a Claude Code plugin');
    // Outside a remote session it exits 0 immediately.
    const r = spawnSync('bash', [path.join(templatesDir, '.claude/hooks/kit-bootstrap.sh')], { encoding: 'utf8', env: { ...process.env, CLAUDE_CODE_REMOTE: '' } });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  test('.claudeignore keeps graphify-out/ out of context and says where it lives', () => {
    const text = read('.claudeignore');
    assert.match(text, /^graphify-out\/$/m);
    assert.match(text, /graph\/ branch/);
    assert.match(text, /\.gitignore/);
    assert.ok(text.split('\n').filter((l) => l && !l.startsWith('#')).every((l) => l === 'graphify-out/'), 'only graphify-out/ is ignored by default');
  });

  test('the rule seeds are short and path-scoped; CLAUDE.md is short and says why', () => {
    const rules = files.filter((x) => x.startsWith('.claude/rules/'));
    assert.deepEqual(rules, ['.claude/rules/billing.md', '.claude/rules/docs.md', '.claude/rules/pr-and-issues.md', '.claude/rules/prisma.md']);
    for (const f of rules) {
      const text = read(f);
      assert.ok(lineCount(text) <= MAX_RULE_LINES, `${f} is ${lineCount(text)} lines; keep it ≤ ${MAX_RULE_LINES}`);
      assert.match(text, /^---\npaths:\n(  - .+\n)+---/, `${f} has a paths: frontmatter`);
    }
    const claudeMd = read('CLAUDE.md');
    assert.ok(lineCount(claudeMd) <= MAX_CLAUDE_MD_LINES, `CLAUDE.md is ${lineCount(claudeMd)} lines; keep it ≤ ${MAX_CLAUDE_MD_LINES}`);
    assert.match(claudeMd, /under 200 lines/);
    assert.match(claudeMd, /\.claude\/rules/);
  });

  test('the docs-consistency test reads the docs.* manifest keys and repairs in every message', () => {
    const text = read('test/docs-consistency.test.mjs');
    for (const k of ['docs.mapFile', 'docs.mapHeading', 'docs.adrDir']) assert.ok(text.includes(k), k);
    assert.match(text, /KNOWN_UNMAPPED = \[\]/);
    assert.match(text, /only shrink/);
    assert.match(text, /add a row to/);
    assert.match(text, /move the dated text to/);
  });

  test('the ADR seeds name every decision a new app takes first', () => {
    const text = read('docs/adr/SEEDS.md');
    for (const seed of ['isolation model', 'Code disposition', 'Forbidden patterns', 'Schema ownership', 'Isolation canary', 'Tenant provisioning', 'Webhook intake', 'Principal', 'MCP auth substrate', 'Deployment target', 'Billing method', 'Distribution', 'Branch model']) {
      assert.ok(text.includes(seed), seed);
    }
    assert.match(read('docs/adr/0000-template.md'), /^---\nstatus: .*\ndate: .*\ndeciders: .*\n---/);
    for (const section of ['## Context', '## Decision', '## Consequences']) assert.ok(read('docs/adr/0000-template.md').includes(section), section);
  });

  // Repo literals: test/no-repo-literals.test.mjs walks templates/ with the forbidden list.
  test('no substituted template keeps an unsubstituted placeholder', () => {
    for (const f of files) {
      assert.equal(substitute(read(f)).match(PLACEHOLDER), null, `${f} keeps a placeholder the substitution table does not know`);
    }
  });
});

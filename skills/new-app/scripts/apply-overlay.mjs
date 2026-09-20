#!/usr/bin/env node
// skills/new-app/scripts/apply-overlay.mjs: applies the kit's templates/ onto a directory that already holds the
// Shopify app template (after `shopify app init`, or a plain clone of the template). Zero dependencies.
//
//   node apply-overlay.mjs --target <dir> --app-name "<name>" [--default-branch main] [--protected-branch main]
//        [--pm npm|pnpm] [--server-dir .] [--kit-root <plugin root>] [--template-ref "<url>#<commit>"] [--print-tree]
//
// What it does, in order (the new-app skill's step 3 and step 4):
//   1. copies every file under templates/ (except templates/README.md and docs/README-docs-map.md), substituting
//      {{APP_NAME}}, {{DEFAULT_BRANCH}}, {{PROTECTED_BRANCH}}, {{PACKAGE_MANAGER}} and {{SERVER_DIR}};
//      {{GITLEAKS_VERSION}} and {{GITLEAKS_SHA256}} stay as a TODO (read them from the gitleaks release's
//      checksums.txt). A file the template already created is never overwritten: text files get the kit's content
//      appended as a delimited section (re-running replaces the section), JSON files are deep-merged with the
//      existing values winning, anything else is set aside as <file>.shopify-app-kit for the maintainer;
//   2. vendors hooks/lib.sh and hooks/guard-*.sh into .claude/hooks/kit/ (the sync skill's procedure) and stamps
//      kit.version and the tag $schema URL in the starter manifest, whose example config and toml names become the
//      app's slug;
//   3. writes docs/README.md (the docs map, rows only for files that exist), docs/history/, and the first ADR
//      docs/adr/0001-scaffold.md with its index row;
//   4. checks the template for the expiring-offline-token flag and the session refresh columns, adds them when
//      missing, and points the Prisma datasource at Postgres through DATABASE_URL / DIRECT_DATABASE_URL.
// Every action is printed as one line (write / merge / aside / vendor / edit / todo). Exit 1 on a bad argument.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { pm: 'npm', serverDir: '.', defaultBranch: 'main', protectedBranch: null, printTree: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => { if (i + 1 >= argv.length) fail(`${a} needs a value`); return argv[++i]; };
    switch (a) {
      case '--target': out.target = next(); break;
      case '--app-name': out.appName = next(); break;
      case '--default-branch': out.defaultBranch = next(); break;
      case '--protected-branch': out.protectedBranch = next(); break;
      case '--pm': out.pm = next(); break;
      case '--server-dir': out.serverDir = next(); break;
      case '--kit-root': out.kitRoot = next(); break;
      case '--template-ref': out.templateRef = next(); break;
      case '--print-tree': out.printTree = true; break;
      case '--help': case '-h': usage(); process.exit(0); break;
      default: fail(`unknown argument ${a}`);
    }
  }
  return out;
}

function usage() {
  console.log('node apply-overlay.mjs --target <dir> --app-name "<name>" [--default-branch main] [--protected-branch main] [--pm npm|pnpm] [--server-dir .] [--kit-root <dir>] [--template-ref <ref>] [--print-tree]');
}

function fail(msg) { console.error(`apply-overlay: ${msg}`); usage(); process.exit(1); }

// ---------------------------------------------------------------- arguments
if (!args.target) fail('--target is required');
if (!args.appName || !args.appName.trim()) fail('--app-name is required');
if (!['npm', 'pnpm'].includes(args.pm)) fail(`--pm must be npm or pnpm, got ${args.pm}`);
const BRANCH = /^(?!-)(?!.*(\.\.|\/\/|@\{))[^\s~^:?*[\\]+(?<!\.lock)(?<!\/)(?<!\.)$/;
if (!BRANCH.test(args.defaultBranch)) fail(`--default-branch "${args.defaultBranch}" is not a valid branch name`);
args.protectedBranch ??= args.defaultBranch;
if (!BRANCH.test(args.protectedBranch)) fail(`--protected-branch "${args.protectedBranch}" is not a valid branch name`);
args.serverDir = path.posix.normalize(args.serverDir.split(path.sep).join('/')).replace(/\/$/, '') || '.';
if (args.serverDir.startsWith('..') || path.posix.isAbsolute(args.serverDir)) fail(`--server-dir must be inside the repo, got ${args.serverDir}`);

const kitRoot = path.resolve(args.kitRoot ?? process.env.CLAUDE_PLUGIN_ROOT ?? path.resolve(here, '..', '..', '..'));
const templatesDir = path.join(kitRoot, 'templates');
if (!fs.existsSync(path.join(templatesDir, 'README.md'))) fail(`no templates/ under ${kitRoot}; pass --kit-root <plugin root>`);
const kitVersion = JSON.parse(fs.readFileSync(path.join(kitRoot, '.claude-plugin', 'plugin.json'), 'utf8')).version;
const target = path.resolve(args.target);
fs.mkdirSync(target, { recursive: true });
const serverRoot = path.join(target, args.serverDir);

const slug = args.appName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
const SUBSTITUTIONS = {
  APP_NAME: args.appName.trim(),
  DEFAULT_BRANCH: args.defaultBranch,
  PROTECTED_BRANCH: args.protectedBranch,
  PACKAGE_MANAGER: args.pm,
  SERVER_DIR: args.serverDir,
};
const PLACEHOLDER = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;
const substitute = (text) => text.replace(PLACEHOLDER, (m, k) => (k in SUBSTITUTIONS ? SUBSTITUTIONS[k] : m));
const BEGIN = (v) => `shopify-app-kit overlay: begin (kit v${v})`;
const END = 'shopify-app-kit overlay: end';
const log = (verb, rel, note = '') => console.log(`${verb.padEnd(7)}${rel}${note ? `  (${note})` : ''}`);
const todos = [];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (entry.isFile()) yield p;
  }
}
const rel = (abs) => path.relative(target, abs).split(path.sep).join('/');
const write = (abs, text, mode) => { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text); if (mode) fs.chmodSync(abs, mode); };

// ---------------------------------------------------------------- merge strategies
const TEXT_MERGEABLE = /(^|\/)(\.gitignore|\.env\.example|\.gitleaks\.toml|[^/]+\.(md|toml|txt|example))$/;

// Comment syntax of the section markers: HTML comments in markdown, a `#` line everywhere else.
const markers = (file) => (/\.md$/.test(file) ? { prefix: '<!-- ', suffix: ' -->' } : { prefix: '# ', suffix: '' });

// Append (or replace) the kit's content as a delimited section at the end of an existing text file.
function mergeText(dest, incoming, file) {
  const { prefix, suffix } = markers(file);
  const begin = `${prefix}${BEGIN(kitVersion)}${suffix}`;
  const end = `${prefix}${END}${suffix}`;
  const existing = fs.readFileSync(dest, 'utf8');
  const section = `${begin}\n${incoming.replace(/\n*$/, '\n')}${end}\n`;
  const beginRe = new RegExp(`\\n?${escape(prefix)}shopify-app-kit overlay: begin[^\\n]*\\n[\\s\\S]*?${escape(end)}\\n?`);
  let out;
  if (beginRe.test(existing)) out = existing.replace(beginRe, `\n${section}`);
  else out = `${existing.replace(/\n*$/, '\n')}\n${section}`;
  fs.writeFileSync(dest, out);
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Existing values win; arrays concatenate without duplicates; objects recurse.
function deepMerge(existing, incoming) {
  if (Array.isArray(existing) && Array.isArray(incoming)) {
    const seen = new Set(existing.map((x) => JSON.stringify(x)));
    return [...existing, ...incoming.filter((x) => !seen.has(JSON.stringify(x)))];
  }
  if (isObj(existing) && isObj(incoming)) {
    const out = { ...existing };
    for (const [k, v] of Object.entries(incoming)) out[k] = k in out ? deepMerge(out[k], v) : v;
    return out;
  }
  return existing;
}
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ---------------------------------------------------------------- 1. the overlay files
const SPECIAL = new Set(['README.md', 'docs/README-docs-map.md']);
const templateFiles = [...walk(templatesDir)].map((f) => path.relative(templatesDir, f).split(path.sep).join('/')).filter((f) => !SPECIAL.has(f)).sort();

for (const file of templateFiles) {
  const src = path.join(templatesDir, file);
  let text = substitute(fs.readFileSync(src, 'utf8'));
  if (file === '.github/dependabot.yml' && args.serverDir === '.') text = dropServerDependabotBlocks(text);
  const mode = file.endsWith('.sh') ? 0o755 : undefined;
  const dest = path.join(target, file);

  if (file === '.claude/shopify-app.json') {
    const manifest = finishManifest(JSON.parse(text));
    text = `${JSON.stringify(manifest, null, 2)}\n`;
    if (!fs.existsSync(dest)) { write(dest, text); log('write', file); } else if (fs.readFileSync(dest, 'utf8') === text) log('ok', file, 'unchanged'); else { write(`${dest}.shopify-app-kit`, text); log('aside', `${file}.shopify-app-kit`, 'a manifest already exists; reconcile by hand'); }
    continue;
  }
  if (!fs.existsSync(dest)) { write(dest, text, mode); log('write', file); continue; }
  // A file the kit itself wrote on an earlier run carries the template header (and no overlay section, which
  // would mean the template had the file first); re-running refreshes it.
  const existing = fs.readFileSync(dest, 'utf8');
  if (existing.includes('shopify-app-kit template') && !existing.includes('shopify-app-kit overlay: begin')) { write(dest, text, mode); log('update', file, 'kit-owned file refreshed'); continue; }
  if (file.endsWith('.json')) {
    const merged = deepMerge(JSON.parse(fs.readFileSync(dest, 'utf8')), JSON.parse(text));
    write(dest, `${JSON.stringify(merged, null, 2)}\n`); log('merge', file, 'JSON deep-merged, existing values kept');
  } else if (TEXT_MERGEABLE.test(file)) {
    mergeText(dest, text, file); log('merge', file, 'kit section appended');
  } else {
    write(`${dest}.shopify-app-kit`, text, mode); log('aside', `${file}.shopify-app-kit`, 'the template already has this file; reconcile by hand');
  }
}
if (templateFiles.some((f) => fs.readFileSync(path.join(templatesDir, f), 'utf8').includes('{{GITLEAKS_'))) {
  todos.push('.github/workflows/secret-scan.yml: replace {{GITLEAKS_VERSION}} and {{GITLEAKS_SHA256}} with the release you pin and the linux_x64 tarball line of its checksums.txt.');
}

// dependabot.yml with the server at the repo root: the second npm block (the one whose comment says to drop it)
// would duplicate the root block, so it goes; every other `directory: /.` becomes `directory: /`.
function dropServerDependabotBlocks(text) {
  return text.split(/\n\n/).filter((block) => !/drop this block when/.test(block)).join('\n\n').replace(/^(\s*directory: )\/\.\s*$/gm, '$1/');
}

function finishManifest(m) {
  m.$schema = `https://raw.githubusercontent.com/loboroboticos/shopify-app-kit/v${kitVersion}/schemas/shopify-app.v1.schema.json`;
  m.kit = { ...m.kit, version: kitVersion };
  const renameCfg = (s) => s.replace(/^example-dev$/, `${slug}-dev`).replace(/^example$/, slug);
  const renameToml = (s) => s.replace(/^shopify\.app\.example(-dev)?\.toml$/, (x, dev) => `shopify.app.${slug}${dev ?? ''}.toml`);
  const prefix = (p) => (args.serverDir === '.' ? p : path.posix.join(args.serverDir, p));
  const norm = (p) => path.posix.normalize(p).replace(/^\.\//, '');
  if (m.shopifyCli?.configs) for (const k of Object.keys(m.shopifyCli.configs)) m.shopifyCli.configs[k] = renameCfg(m.shopifyCli.configs[k]);
  if (m.paths) {
    for (const k of Object.keys(m.paths)) {
      if (typeof m.paths[k] === 'string') m.paths[k] = norm(m.paths[k]);
      else if (Array.isArray(m.paths[k])) m.paths[k] = m.paths[k].map((p) => norm(/\.toml$/.test(p) ? prefix(renameToml(p)) : p));
    }
  }
  if (Array.isArray(m.apiVersion?.pins)) m.apiVersion.pins = m.apiVersion.pins.map((p) => norm(/\.toml$/.test(p) ? prefix(renameToml(p)) : p));
  if (m.branches) {
    m.branches.promotion = args.defaultBranch === args.protectedBranch ? null : { from: args.defaultBranch, to: args.protectedBranch };
  }
  return m;
}

// ---------------------------------------------------------------- 2. vendored hooks
const hookDir = path.join(target, '.claude', 'hooks', 'kit');
for (const name of fs.readdirSync(path.join(kitRoot, 'hooks')).filter((n) => n === 'lib.sh' || /^guard-.*\.sh$/.test(n)).sort()) {
  write(path.join(hookDir, name), fs.readFileSync(path.join(kitRoot, 'hooks', name), 'utf8'), 0o755);
  log('vendor', `.claude/hooks/kit/${name}`);
}

// ---------------------------------------------------------------- 3. docs map, history, first ADR
fs.mkdirSync(path.join(target, 'docs', 'history'), { recursive: true });
if (!fs.existsSync(path.join(target, 'docs', 'history', '.gitkeep'))) { write(path.join(target, 'docs', 'history', '.gitkeep'), ''); log('write', 'docs/history/.gitkeep'); }

const manifestPath = path.join(target, '.claude', 'shopify-app.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const mapFile = manifest.docs?.mapFile ?? 'docs/README.md';
const mapHeading = manifest.docs?.mapHeading ?? '## Docs map';
const adrDir = manifest.docs?.adrDir ?? 'docs/adr';
writeDocsMap();
writeFirstAdr();

function writeDocsMap() {
  const shape = fs.readFileSync(path.join(templatesDir, 'docs', 'README-docs-map.md'), 'utf8');
  const body = shape.replace(/^<!--[\s\S]*?-->\n*/, '').replace(/\n*<!--[\s\S]*?-->\s*$/, '\n');
  const lines = body.split('\n');
  const headingIdx = lines.findIndex((l) => /^## /.test(l));
  if (headingIdx !== -1) lines[headingIdx] = mapHeading;
  const kept = [];
  const planned = [];
  for (const l of lines) {
    const row = l.match(/^\| `([^`]+)` \|/);
    if (!row) { kept.push(l); continue; }
    if (row[1] === mapFile) continue;
    if (fs.existsSync(path.join(target, row[1]))) kept.push(l); else planned.push(l);
  }
  const headerIdx = kept.findIndex((l) => /^\| --- \|/.test(l));
  if (headerIdx !== -1) kept.splice(headerIdx + 1, 0, `| \`${mapFile}\` | This map: one row per file under \`docs/\`, the owner of each fact | index |`);
  let text = `<!-- ${mapFile} (scaffolded by shopify-app-kit new-app). The docs map the manifest names as docs.mapFile;\n     test/docs-consistency.test.mjs fails when a file under docs/ has no row under docs.mapHeading. -->\n\n# Docs\n\n${kept.join('\n').replace(/\n*$/, '\n')}`;
  // Planned rows go into a comment as a list, not table rows: the consistency test reads every "| `path` |" line
  // of the section and would reject a path that does not exist yet.
  if (planned.length) {
    const items = planned.map((l) => l.split('|').slice(1, -1).map((c) => c.trim())).map(([doc, owns, kind]) => `  - ${doc.replace(/`/g, '')}: ${owns} (${kind})`);
    text += `\n<!-- Planned documents. Create the file, then add its row to the table above:\n${items.join('\n')}\n-->\n`;
  }
  const dest = path.join(target, mapFile);
  if (fs.existsSync(dest)) {
    const existing = fs.readFileSync(dest, 'utf8');
    if (existing.split('\n').some((l) => l.trim() === mapHeading)) { log('skip', mapFile, `already has a "${mapHeading}" section`); return; }
    mergeText(dest, text.replace(/^<!--[\s\S]*?-->\n*/, '').replace(/^# Docs\n\n/, ''), mapFile); log('merge', mapFile, 'docs map appended');
  } else { write(dest, text); log('write', mapFile); }
}

function writeFirstAdr() {
  const file = path.join(target, adrDir, '0001-scaffold.md');
  const index = path.join(target, adrDir, 'README.md');
  const today = new Date().toISOString().slice(0, 10);
  const seedsFile = path.join(target, adrDir, 'SEEDS.md');
  const seeds = fs.existsSync(seedsFile) ? [...fs.readFileSync(seedsFile, 'utf8').matchAll(/^\d+\. \*\*([^*]+?)\.?\*\*/gm)].map((m) => m[1]) : [];
  const templateRef = args.templateRef ?? 'https://github.com/Shopify/shopify-app-template-react-router (default branch at scaffold time)';
  if (!fs.existsSync(file)) {
    const text = `---
status: accepted
date: ${today}
deciders: the maintainer
---

# 0001. Scaffold from the Shopify React Router template with the shopify-app-kit shell

## Context

A new Shopify app needs application code and a repository around it. The application code could be written
from scratch, forked from an earlier attempt, or taken from Shopify's recommended template; the repository
shell (CI, secret scanning, the manifest the guard hooks read, the docs discipline) could be assembled by hand
or taken from a kit. The serious alternative was forking an earlier attempt with its tooling; it was rejected
because the tooling of an earlier attempt carries its incidents, and the template is what Shopify's own tooling
and documentation assume.

## Decision

The app starts from the official template (React Router 7, Polaris web components, Prisma session storage) at
${templateRef}, with the shopify-app-kit repo shell (kit v${kitVersion}) applied on top by the \`new-app\`
skill: the manifest \`.claude/shopify-app.json\`, the vendored guard hooks under \`.claude/hooks/kit/\`, CI
with the migrate rehearsal and drift check, secret scanning, the dependency audit, the work-item issue
template, the docs map and its consistency test, the ADR series and the rule seeds under \`.claude/rules/\`.
Package manager: ${args.pm}. Server directory: \`${args.serverDir}\`. Default branch \`${args.defaultBranch}\`;
protected branch \`${args.protectedBranch}\`${args.defaultBranch === args.protectedBranch ? ' (single-branch model, PRs land on the protected branch)' : ` (promotion PR ${args.defaultBranch} -> ${args.protectedBranch})`}.

## Consequences

The template's files are upstream: upgrades follow the template's changelog, and kit upgrades follow
\`/shopify-app-kit:sync\`. The following seed decisions from \`SEEDS.md\` are still open and each needs its own
record before the code that depends on it is written:

${seeds.map((s, i) => `${i + 1}. ${s}`).join('\n') || '(see SEEDS.md)'}

The Prisma datasource was pointed at Postgres (\`DATABASE_URL\` for the runtime role, \`DIRECT_DATABASE_URL\`
for the owner role); the template's SQLite migration must be replaced by a first Postgres migration that also
creates the two roles and the isolation canary, once the database project exists.
`;
    write(file, text); log('write', `${adrDir}/0001-scaffold.md`);
  }
  if (fs.existsSync(index)) {
    const text = fs.readFileSync(index, 'utf8');
    if (!text.includes('0001-scaffold.md') && !/^\| 0001 \|/m.test(text)) {
      const row = `| 0001 | [Scaffold from the Shopify React Router template with the kit shell](0001-scaffold.md) | accepted | ${today} |`;
      fs.writeFileSync(index, text.replace(/(\| 0000 \| Template \| n\/a \| n\/a \|\n)/, `$1${row}\n`));
      log('edit', `${adrDir}/README.md`, 'index row for 0001');
    }
  }
}

// ---------------------------------------------------------------- 4. post-scaffold edits the template needs
const shopifyServer = path.join(serverRoot, manifest.paths?.shopifyServer?.replace(new RegExp(`^${escape(args.serverDir)}/?`), '') ?? 'app/shopify.server.ts');
const prismaSchema = path.join(serverRoot, 'prisma', 'schema.prisma');

if (fs.existsSync(shopifyServer)) {
  let text = fs.readFileSync(shopifyServer, 'utf8');
  if (!/expiringOfflineAccessTokens\s*:\s*true/.test(text)) {
    if (/future\s*:\s*\{/.test(text)) text = text.replace(/future\s*:\s*\{/, 'future: {\n    expiringOfflineAccessTokens: true,');
    else if (/shopifyApp\(\{/.test(text)) text = text.replace(/shopifyApp\(\{/, 'shopifyApp({\n  future: { expiringOfflineAccessTokens: true },');
    else todos.push(`${rel(shopifyServer)}: set future.expiringOfflineAccessTokens: true by hand (no shopifyApp({ call found).`);
    if (/expiringOfflineAccessTokens\s*:\s*true/.test(text)) { fs.writeFileSync(shopifyServer, text); log('edit', rel(shopifyServer), 'future.expiringOfflineAccessTokens: true'); }
  } else log('ok', rel(shopifyServer), 'future.expiringOfflineAccessTokens already true');
} else todos.push(`${rel(shopifyServer)} not found: set future.expiringOfflineAccessTokens: true in the Shopify server module.`);

if (fs.existsSync(prismaSchema)) {
  let text = fs.readFileSync(prismaSchema, 'utf8');
  const session = text.match(/model Session \{[\s\S]*?\n\}/);
  if (!session) todos.push(`${rel(prismaSchema)}: no Session model found; add refreshToken String? and refreshTokenExpires DateTime? to the session model.`);
  else if (!/refreshToken\b/.test(session[0]) || !/refreshTokenExpires\b/.test(session[0])) {
    const cols = [];
    if (!/refreshToken\b/.test(session[0])) cols.push('  refreshToken        String?');
    if (!/refreshTokenExpires\b/.test(session[0])) cols.push('  refreshTokenExpires DateTime?');
    text = text.replace(session[0], session[0].replace(/\n\}$/, `\n${cols.join('\n')}\n}`));
    fs.writeFileSync(prismaSchema, text); log('edit', rel(prismaSchema), `Session: ${cols.map((c) => c.trim().split(/\s+/)[0]).join(', ')}`);
  } else log('ok', rel(prismaSchema), 'Session carries refreshToken and refreshTokenExpires');
  if (/provider\s*=\s*"sqlite"/.test(text)) {
    text = text.replace(/datasource db \{[\s\S]*?\n\}/, (block) => block
      .replace(/provider\s*=\s*"sqlite"/, 'provider  = "postgresql"')
      .replace(/url\s*=\s*"file:[^"]*"/, 'url       = env("DATABASE_URL")\n  directUrl = env("DIRECT_DATABASE_URL")'));
    fs.writeFileSync(prismaSchema, text); log('edit', rel(prismaSchema), 'datasource: postgresql via DATABASE_URL and DIRECT_DATABASE_URL');
    // The template's migration is SQLite SQL (DATETIME columns, a sqlite migration_lock); it cannot run on
    // Postgres and CI's migrate rehearsal would fail on it. The first Postgres migration replaces it.
    const migrations = path.join(serverRoot, 'prisma', 'migrations');
    if (fs.existsSync(migrations)) { fs.rmSync(migrations, { recursive: true, force: true }); log('remove', rel(migrations), 'SQLite migrations from the template'); }
    todos.push(`${rel(path.join(serverRoot, 'prisma', 'migrations'))}: generate the first Postgres migration (with the two roles and the isolation canary) against the database project's owner URL once it exists.`);
  }
} else todos.push(`${rel(prismaSchema)} not found: the session model needs refreshToken String? and refreshTokenExpires DateTime?.`);

// Files the template ships for its own repository (issue triage of the template, editor configs), not for the app.
for (const extra of ['.claude/skills/investigating-github-issues', '.claude/skills/shared', '.cursor', '.gemini']) {
  if (fs.existsSync(path.join(target, extra))) log('note', extra, 'template-repo tooling, not about this app; remove it in the scaffold commit');
}

// ---------------------------------------------------------------- report
console.log(`\napply-overlay: kit v${kitVersion} applied to ${target} (app "${args.appName}", slug ${slug}, ${args.pm}, server dir ${args.serverDir}, branches ${args.defaultBranch}/${args.protectedBranch}).`);
if (todos.length) { console.log('TODO before the first push:'); for (const t of todos) console.log(`  - ${t}`); }
if (args.printTree) {
  console.log('\nTree:');
  for (const f of [...walk(target)].map(rel).filter((f) => !f.startsWith('node_modules/') && !f.startsWith('.git/')).sort()) console.log(`  ${f}`);
}

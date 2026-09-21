#!/usr/bin/env node
// scripts/sync-labels.mjs: create or update every label in labels.json on a GitHub repository through the gh
// CLI. Zero dependencies. For each entry it runs
//   gh label create <name> --color <color> --description <description> --force
// (`--force` updates a label that already exists, so the script is idempotent). It never deletes a label: a
// label that is in the repo but not in labels.json is left alone (the triage routine reports orphans).
//
// Usage: node scripts/sync-labels.mjs [--repo <owner>/<repo>] [--file <labels.json>] [--dry-run]
//   --repo     the repository to sync (default: the repository of the current directory, as gh resolves it)
//   --file     an alternative labels file (default: the labels.json next to this script's parent directory;
//              a consumer that keeps its own copy passes .github/labels.json)
//   --dry-run  print the gh commands instead of running them
// Exit 0 when every label was created or updated (or printed), 1 on a bad argument or a failed gh call.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opts = { repo: '', file: path.resolve(here, '..', 'labels.json'), dryRun: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--dry-run') opts.dryRun = true;
  else if (a === '--repo' && args[i + 1]) opts.repo = args[++i];
  else if (a.startsWith('--repo=')) opts.repo = a.slice('--repo='.length);
  else if (a === '--file' && args[i + 1]) opts.file = path.resolve(args[++i]);
  else if (a.startsWith('--file=')) opts.file = path.resolve(a.slice('--file='.length));
  else if (a === '-h' || a === '--help') { console.log('usage: sync-labels.mjs [--repo <owner>/<repo>] [--file <labels.json>] [--dry-run]'); process.exit(0); }
  else { console.error(`sync-labels: unknown argument ${a}`); process.exit(1); }
}
if (opts.repo && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(opts.repo)) { console.error(`sync-labels: --repo must be <owner>/<repo>, got ${opts.repo}`); process.exit(1); }

let doc;
try { doc = JSON.parse(fs.readFileSync(opts.file, 'utf8')); } catch (e) { console.error(`sync-labels: cannot read ${opts.file}: ${e.message}`); process.exit(1); }
const labels = Array.isArray(doc) ? doc : doc.labels;
if (!Array.isArray(labels) || labels.length === 0) { console.error(`sync-labels: ${opts.file} carries no labels array`); process.exit(1); }
for (const l of labels) {
  if (typeof l.name !== 'string' || !l.name.trim()) { console.error('sync-labels: every label needs a name'); process.exit(1); }
  if (!/^[0-9a-fA-F]{6}$/.test(l.color ?? '')) { console.error(`sync-labels: label ${l.name} needs a six-hex color, got ${l.color}`); process.exit(1); }
  if (typeof l.description !== 'string') { console.error(`sync-labels: label ${l.name} needs a description`); process.exit(1); }
}

// A shell-safe rendering of one gh invocation, for --dry-run output and error messages.
const q = (s) => (/^[A-Za-z0-9_./:=-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`);
const command = (l) => {
  const parts = ['gh', 'label', 'create', l.name, '--color', l.color.toLowerCase(), '--description', l.description, '--force'];
  if (opts.repo) parts.push('--repo', opts.repo);
  return parts;
};

let failed = 0;
for (const l of labels) {
  const parts = command(l);
  if (opts.dryRun) { console.log(parts.map(q).join(' ')); continue; }
  const r = spawnSync(parts[0], parts.slice(1), { encoding: 'utf8' });
  if (r.error || r.status !== 0) {
    failed++;
    console.error(`sync-labels: failed: ${parts.map(q).join(' ')}\n${(r.stderr || r.error?.message || '').trim()}`);
  } else {
    console.log(`sync-labels: ${l.name} ok`);
  }
}
if (!opts.dryRun) console.log(`sync-labels: ${labels.length - failed} of ${labels.length} labels created or updated${opts.repo ? ` on ${opts.repo}` : ''}; nothing deleted.`);
process.exit(failed ? 1 : 0);

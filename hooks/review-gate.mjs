#!/usr/bin/env node
// shopify-app-kit v0.21.0
// review-gate.mjs: the review receipt (parse, render, splice into a PR body) and the CI gate that checks it. Vendored by
// /shopify-app-kit:sync to .github/kit/review-gate.mjs and run by .github/workflows/kit-review-gate.yml from the BASE
// branch (pull_request_target), so a PR never runs its own copy. Zero dependencies; node 20+.
//   node review-gate.mjs check                          the CI gate (reads GITHUB_EVENT_PATH, GITHUB_TOKEN, the manifest)
//   node review-gate.mjs splice <body> <receipt.json>   prints <body> with its receipt block replaced or appended
//   node review-gate.mjs link <body> <receipt.json> <review-url>   records a posted independent review in the body receipt
//   node review-gate.mjs models [manifest]              prints the workflows' args.models from review.models
//   node review-gate.mjs globs [manifest]               prints the effective independentFor globs, one per line
//   node review-gate.mjs touched [manifest] < paths     prints the paths on stdin that match those globs
//   node review-gate.mjs receipt < body                 prints only the body's receipt as JSON (or the parse error)
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const OPEN = '<!-- shopify-app-kit:review-receipt -->';
export const CLOSE = '<!-- /shopify-app-kit:review-receipt -->';
export const OVERRIDE_LABEL = 'review-gate:override';
const FULL = ['pre-pr-review', 'review', 'independent'];
const DELTA = ['delta', 'independent-delta'];
const VERDICTS = ['approve', 'changes-needed', 'block'];
const SHA = /^[0-9a-f]{40}$/;
const MODEL = /^[a-z0-9][a-z0-9.\-[\]]*$/;
// The gate's own files, the manifest it reads and any workflow (one could publish a check named like the gate's):
// a change to any of them always needs an independent review.
export const ALWAYS_INDEPENDENT = ['.github/kit/**', '.github/workflows/**', '.claude/shopify-app.json'];
// Who may post an independent review: someone with a role on the repository, never a drive-by or fork-only account.
const REVIEWER_ROLES = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const FILE_CAP = 3000; // GET pulls/{n}/files lists at most 3000; a larger PR counts as touching every independentFor path

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;

// A link of a receipt chain: { kind, sha, fromSha? }. Full kinds start a chain, delta kinds extend it.
function linkError(l, i) {
  if (!isObj(l) || !(FULL.includes(l.kind) || DELTA.includes(l.kind))) return `link ${i}: unknown kind`;
  if (!SHA.test(l.sha ?? '')) return `link ${i}: sha must be 40 lowercase hex`;
  if (DELTA.includes(l.kind) && !SHA.test(l.fromSha ?? '')) return `link ${i}: a ${l.kind} needs fromSha`;
  return null;
}

// The chain a receipt attests, oldest first, itself last. Errors when it does not start full or a delta skips a link.
export function chainOf(r) {
  const links = [...(Array.isArray(r.chain) ? r.chain : []), { kind: r.kind, sha: r.sha, fromSha: r.fromSha }];
  const errors = [];
  links.forEach((l, i) => { const e = linkError(l, i); if (e) errors.push(e); });
  if (errors.length) return { links, errors };
  if (!FULL.includes(links[0].kind)) errors.push('a chain starts with a full review (pre-pr-review, review or independent)');
  for (let i = 1; i < links.length; i++) {
    if (!DELTA.includes(links[i].kind)) errors.push(`link ${i}: only the first link is a full review; later ones are deltas`);
    else if (links[i].fromSha !== links[i - 1].sha) errors.push(`link ${i}: fromSha ${links[i].fromSha.slice(0, 7)} is not the previous link's sha ${links[i - 1].sha.slice(0, 7)}`);
  }
  return { links, errors };
}

export function validateReceipt(r) {
  const e = [];
  if (!isObj(r)) return ['the receipt is not a JSON object'];
  if (r.v !== 1) e.push('v must be 1');
  if (!VERDICTS.includes(r.verdict)) e.push(`verdict must be one of ${VERDICTS.join(' | ')}`);
  if (!Number.isInteger(r.confirmed) || r.confirmed < 0) e.push('confirmed must be a non-negative integer');
  if (r.roster !== undefined && !(Array.isArray(r.roster) && r.roster.every(isStr))) e.push('roster must be an array of agent names');
  if (r.models !== undefined && !(isObj(r.models) && Object.values(r.models).every(isStr))) e.push('models must map agent names to model names');
  if (r.reviewerSession !== undefined && !(typeof r.reviewerSession === 'string' && r.reviewerSession.length <= 200)) e.push('reviewerSession must be a string of at most 200 characters');
  if (FULL.includes(r.kind) && r.chain !== undefined && !(Array.isArray(r.chain) && r.chain.length === 0)) e.push('a full review carries no chain');
  if (r.independent !== undefined && r.independent !== null
    && !(Array.isArray(r.independent) && r.independent.every((l) => isObj(l) && isStr(l.url) && SHA.test(l.sha ?? '')))) e.push('independent must be null or an array of { url, sha }');
  e.push(...chainOf(r).errors);
  return e;
}

// The first OPEN marker starts the receipt; a second OPEN marker anywhere in the body is an error, never a choice.
export function parseReceipt(body) {
  const text = String(body ?? '').replace(/\r\n/g, '\n');
  const start = text.indexOf(OPEN);
  if (start < 0) return { error: 'no review receipt in the PR body' };
  if (text.indexOf(OPEN, start + OPEN.length) >= 0) return { error: 'more than one review receipt marker in the PR body' };
  const end = text.indexOf(CLOSE, start);
  if (end < 0) return { error: 'the review receipt has no closing marker' };
  const m = /```json\n([\s\S]*?)\n```/.exec(text.slice(start + OPEN.length, end));
  if (!m) return { error: 'the review receipt has no ```json block' };
  let receipt;
  try { receipt = JSON.parse(m[1]); } catch { return { error: 'the review receipt is not valid JSON' }; }
  const errors = validateReceipt(receipt);
  return errors.length ? { error: `the review receipt is malformed: ${errors.join('; ')}` } : { receipt };
}

export const renderReceipt = (r) => `${OPEN}\n### Review receipt\n\n\`\`\`json\n${JSON.stringify(r, null, 2)}\n\`\`\`\n${CLOSE}`;

export function spliceReceipt(body, r) {
  const errors = validateReceipt(r);
  if (errors.length) throw new Error(`refusing to write a malformed receipt: ${errors.join('; ')}`);
  const text = String(body ?? '').replace(/\r\n/g, '\n');
  const start = text.indexOf(OPEN);
  if (start < 0) return `${text.replace(/\s+$/, '')}${text.trim() ? '\n\n' : ''}${renderReceipt(r)}\n`;
  if (text.indexOf(OPEN, start + OPEN.length) >= 0) throw new Error('the body carries more than one receipt marker; remove the extra one by hand');
  const end = text.indexOf(CLOSE, start);
  if (end < 0) throw new Error('the body\'s receipt has no closing marker; repair it by hand');
  return text.slice(0, start) + renderReceipt(r) + text.slice(end + CLOSE.length);
}

// Records a posted independent review (its receipt and URL) in the body receipt: a full independent review starts the
// independent chain, an independent-delta extends it. With no body receipt yet, the posted receipt becomes it.
export function linkIndependent(body, posted, url) {
  if (!['independent', 'independent-delta'].includes(posted.kind)) throw new Error('only an independent or independent-delta receipt can be linked');
  const link = { url, sha: posted.sha };
  const cur = parseReceipt(body);
  if (cur.error && !/^no review receipt/.test(cur.error)) throw new Error(cur.error);
  const base = cur.receipt ?? { ...posted };
  const prior = Array.isArray(base.independent) ? base.independent : [];
  return spliceReceipt(body, { ...base, independent: posted.kind === 'independent' ? [link] : [...prior, link] });
}

// Glob to RegExp: ** spans directories, * and ? stay within one segment; a pattern with no wildcard also matches
// everything under it as a directory.
export function globToRegExp(glob) {
  const g = String(glob).replace(/^\.\//, '').replace(/\/+$/, '');
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; } }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(/[*?]/.test(g) ? `^${re}$` : `^${re}(?:/.*)?$`);
}

// The effective independentFor set: the gate's own files, the manifest's risky paths, then review.independentFor.
export function independentGlobs(manifest) {
  const p = isObj(manifest?.paths) ? manifest.paths : {};
  const dir = (d) => { const s = d.replace(/^\.\//, '').replace(/\/+$/, ''); return s === '.' || s === '' ? '**' : `${s}/**`; };
  const out = [...ALWAYS_INDEPENDENT];
  if (isStr(p.webhookHandlers)) out.push(dir(p.webhookHandlers));
  for (const t of Array.isArray(p.appTomls) ? p.appTomls : []) if (isStr(t)) out.push(t);
  if (isStr(p.prisma)) out.push(dir(p.prisma));
  for (const x of Array.isArray(p.extensions) ? p.extensions : []) if (isStr(x)) out.push(dir(x));
  for (const g of Array.isArray(manifest?.review?.independentFor) ? manifest.review.independentFor : []) if (isStr(g)) out.push(g);
  return [...new Set(out)];
}

// review.models -> the workflows' args.models: default -> reviewer, skeptic, judgment; mechanical -> scope; an agent
// name passes through. Values that are not model-shaped are dropped.
export function modelsArgs(manifest) {
  const m = isObj(manifest?.review?.models) ? manifest.review.models : {};
  const out = {};
  for (const [k, v] of Object.entries(m)) {
    if (!isStr(v) || !MODEL.test(v)) continue;
    if (k === 'default') { out.reviewer = v; out.skeptic = v; out.judgment = v; }
    else if (k === 'mechanical') out.scope = v;
    else if (/^[a-z0-9-]+$/.test(k)) out[k] = v;
  }
  return out;
}

// Attacker-controlled text (PR body, labels, receipt values) reaches a workflow command or the step summary only
// through this: no newline, no %, no ::, no markdown or HTML metacharacters, capped.
export const clean = (s, n = 200) => String(s ?? '').replace(/[\r\n%]+/g, ' ').replace(/::/g, ': ').replace(/[\\`*_[\]<>|#!@]/g, '\\$&').trim().slice(0, n);

// The gate. ctx: { manifest, pull (GET pulls/{n}), files (changed paths, or null over the cap), repo 'owner/name',
// event (the workflow event payload), api: { review(id) -> review|null, isAncestor(sha) -> bool, comments() -> [] } }.
export async function gate({ manifest, pull, files, repo, event, api }) {
  const res = { status: 'pass', errors: [], warnings: [], notes: [] };
  const fail = (m) => { res.errors.push(m); res.status = 'fail'; };
  const def = manifest?.branches?.default;
  if (!isStr(def)) { fail('the base branch\'s .claude/shopify-app.json has no branches.default; the gate cannot tell which PRs it guards'); return res; }
  if (pull.base?.ref !== def) { res.status = 'skip'; res.notes.push(`base ${clean(pull.base?.ref)} is not ${clean(def)}; not gated`); return res; }
  if (pull.draft) { res.status = 'skip'; res.notes.push('draft PR; checked again when it is marked ready for review'); return res; }
  const head = pull.head?.sha;

  // The override is the label plus a PR comment by someone with a role on the repository naming this exact head, so a
  // push after it, or a line the PR author writes, never carries it.
  if ((pull.labels ?? []).some((l) => l?.name === OVERRIDE_LABEL)) {
    const re = /^Review-gate override ([0-9a-f]{40}):[ \t]*(\S.*)$/m;
    const hit = (await api.comments()).filter((c) => REVIEWER_ROLES.includes(c?.author_association))
      .map((c) => ({ by: c.user?.login, m: re.exec(String(c.body ?? '').replace(/\r\n/g, '\n')) })).filter((c) => c.m && c.m[1] === head).pop();
    if (!hit) { fail(`the ${OVERRIDE_LABEL} label needs a PR comment by an owner, member or collaborator with the line "Review-gate override ${String(head)}: <reason>" (the current head; a push needs a new one)`); return res; }
    res.override = { reason: clean(hit.m[2]), by: clean(hit.by, 60) };
    res.warnings.push(`review gate overridden for ${String(head).slice(0, 7)} by ${res.override.by}: ${res.override.reason}`);
    return res;
  }

  const parsed = parseReceipt(pull.body);
  if (parsed.error) { fail(`${parsed.error}. Run /shopify-app-kit:pre-pr-review and splice its receipt into the PR body (node .github/kit/review-gate.mjs splice).`); return res; }
  const r = parsed.receipt;
  const { links } = chainOf(r);
  if (r.sha !== head) fail(`the receipt reviewed ${r.sha.slice(0, 7)} but the PR head is ${String(head).slice(0, 7)} (stale). Re-review the new commits (a delta from ${r.sha.slice(0, 7)} is enough) and splice the new receipt.`);
  for (const l of links) if (l.sha !== head && !(await api.isAncestor(l.sha))) fail(`receipt link ${l.sha.slice(0, 7)} is not an ancestor of the head; the chain does not describe this branch`);
  if (r.verdict === 'block') fail(`the receipt's verdict is block (${r.confirmed} confirmed findings); fix them and re-review`);
  if (r.verdict === 'changes-needed') res.warnings.push(`the receipt's verdict is changes-needed (${r.confirmed} confirmed findings)`);
  res.notes.push(`receipt: ${links.map((l) => `${l.kind} ${l.sha.slice(0, 7)}`).join(' -> ')}, verdict ${r.verdict}`);

  const globs = independentGlobs(manifest).map((g) => [g, globToRegExp(g)]);
  // A PR by an author with no role on the repository wrote its own receipt; only a role-holder's review counts.
  const untrusted = REVIEWER_ROLES.includes(pull.author_association) ? [] : [`the PR author (${String(pull.author_association)}) has no role on this repository`];
  const touched = [...untrusted, ...(files === null ? [`more than ${FILE_CAP} changed files`] : files.filter((f) => globs.some(([, re]) => re.test(f))))];
  if (touched.length === 0) return res;
  res.notes.push(`independentFor paths changed: ${touched.slice(0, 5).map((f) => clean(f, 120)).join(', ')}${touched.length > 5 ? ` and ${touched.length - 5} more` : ''}`);
  const ind = Array.isArray(r.independent) ? r.independent : [];
  if (ind.length === 0) { fail('independentFor paths changed and the receipt links no independent review. Run /shopify-app-kit:independent-review from a session that did not author this branch.'); return res; }
  const urlRe = new RegExp(`^https://github\\.com/${repo.replace(/[.\\]/g, '\\$&')}/pull/${pull.number}#pullrequestreview-(\\d+)$`);
  let prev = null;
  for (const [i, l] of ind.entries()) {
    const id = urlRe.exec(l.url)?.[1];
    if (!id) { fail(`independent link ${i + 1} is not a review on this PR (https://github.com/${clean(repo)}/pull/${pull.number}#pullrequestreview-<id>)`); return res; }
    const rv = await api.review(id);
    if (!rv) { fail(`independent review ${id} does not exist on this PR`); return res; }
    if (rv.state !== 'COMMENTED') { fail(`independent review ${id} is ${clean(rv.state, 30)}, not a standing COMMENT review`); return res; }
    if (!REVIEWER_ROLES.includes(rv.author_association)) { fail(`independent review ${id} is by ${clean(rv.user?.login, 60)} (${clean(rv.author_association, 30)}), who has no role on this repository (${REVIEWER_ROLES.join(', ')})`); return res; }
    if (rv.commit_id !== l.sha) { fail(`independent review ${id} was posted on ${String(rv.commit_id).slice(0, 7)}, not ${l.sha.slice(0, 7)}`); return res; }
    const pr = parseReceipt(rv.body);
    const want = i === 0 ? 'independent' : 'independent-delta';
    if (pr.error || pr.receipt.kind !== want || pr.receipt.sha !== l.sha || (i > 0 && pr.receipt.fromSha !== prev)) {
      fail(`independent review ${id}'s own body does not carry a ${want} receipt for ${l.sha.slice(0, 7)}${i > 0 ? ` from ${prev.slice(0, 7)}` : ''}`); return res;
    }
    if (l.sha !== head && !(await api.isAncestor(l.sha))) { fail(`independent review ${id}'s commit is not an ancestor of the head`); return res; }
    if (pr.receipt.verdict === 'block') fail(`independent review ${id}'s verdict is block`);
    res.notes.push(`independent review ${id} by ${clean(rv.user?.login, 60)} (${clean(rv.author_association, 30)})${pr.receipt.reviewerSession ? `, session ${clean(pr.receipt.reviewerSession, 80)}` : ''}${rv.user?.login && rv.user.login === pull.user?.login ? ', the same account as the PR author' : ''}`);
    prev = l.sha;
  }
  if (prev !== head) fail(`the independent chain ends at ${prev.slice(0, 7)}, not the head ${String(head).slice(0, 7)}; run /shopify-app-kit:independent-review again (a delta is enough)`);
  res.notes.push('independence means a session without the author\'s context; every session may post as the same GitHub account');
  return res;
}

// What the status job posts as the shopify-app-kit/review-gate commit status: three GITHUB_OUTPUT lines, printable ASCII.
export function statusOutputs(res, sha) {
  const line = (s) => String(s).replace(/[^\x20-\x7e]/g, ' ').slice(0, 140);
  const description = res.status === 'fail' ? `${res.errors.length} problem(s): ${res.errors[0]}` : res.override ? `overridden: ${res.override.reason}` : res.status === 'skip' ? `not gated: ${res.notes[0] ?? ''}` : 'review receipt current';
  return `state=${res.status === 'fail' ? 'failure' : 'success'}\nsha=${SHA.test(sha ?? '') ? sha : ''}\ndescription=${line(description)}\n`;
}

// ------------------------------------------------------------------------------------------------------------ CLI
async function github(path, { allow404 = false } = {}) {
  const api = process.env.GITHUB_API_URL || 'https://api.github.com';
  const r = await fetch(`${api}/repos/${process.env.GITHUB_REPOSITORY}${path}`, { headers: {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'shopify-app-kit-review-gate' } });
  if (allow404 && (r.status === 404 || r.status === 422)) return null;
  if (!r.ok) throw new Error(`GET ${path}: HTTP ${r.status}`);
  return r.json();
}

async function check(manifestPath) {
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const n = event.pull_request?.number;
  if (!Number.isInteger(n)) throw new Error('not a pull_request event');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  // Always the live PR: a re-run reuses the original payload, whose head and body may be stale.
  const pull = await github(`/pulls/${n}`);
  let files = [];
  if (pull.changed_files > FILE_CAP) files = null;
  else for (let page = 1; page <= FILE_CAP / 100; page++) {
    const batch = await github(`/pulls/${n}/files?per_page=100&page=${page}`);
    for (const f of batch) files.push(f.filename, ...(f.previous_filename ? [f.previous_filename] : []));
    if (batch.length < 100) break;
  }
  const res = await gate({ manifest, pull, files, repo: process.env.GITHUB_REPOSITORY, event, api: {
    review: (id) => github(`/pulls/${n}/reviews/${id}`, { allow404: true }),
    isAncestor: async (sha) => ['ahead', 'identical'].includes((await github(`/compare/${sha}...${pull.head.sha}`, { allow404: true }))?.status),
    // At most 1000 comments: an override further down is missed, which fails closed.
    comments: async () => { const all = []; for (let p = 1; p <= 10; p++) { const b = await github(`/issues/${n}/comments?per_page=100&page=${p}`); all.push(...b); if (b.length < 100) break; } return all; },
  } });
  for (const m of res.notes) console.log(m);
  for (const m of res.warnings) console.log(`::warning::${m}`);
  for (const m of res.errors) console.log(`::error::${m}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [`### Review gate: ${res.status}`, '', ...res.errors.map((m) => `- **fail:** ${m}`), ...res.warnings.map((m) => `- **warning:** ${m}`), ...res.notes.map((m) => `- ${m}`)];
    if (res.override) lines.push('', `**Override** of ${pull.head.sha} by ${res.override.by}: ${res.override.reason}`);
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, statusOutputs(res, pull.head?.sha));
  return res.status === 'fail' ? 1 : 0;
}

const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
async function main([cmd, ...a]) {
  const manifestPath = '.claude/shopify-app.json';
  if (cmd === 'check') return check(a[0] ?? manifestPath);
  if (cmd === 'splice' && a.length === 2) { process.stdout.write(spliceReceipt(fs.readFileSync(a[0], 'utf8'), readJson(a[1]))); return 0; }
  if (cmd === 'link' && a.length === 3) { process.stdout.write(linkIndependent(fs.readFileSync(a[0], 'utf8'), readJson(a[1]), a[2])); return 0; }
  if (cmd === 'models') { console.log(JSON.stringify(modelsArgs(readJson(a[0] ?? manifestPath)))); return 0; }
  if (cmd === 'globs') { console.log(independentGlobs(readJson(a[0] ?? manifestPath)).join('\n')); return 0; }
  if (cmd === 'touched') {
    const res = independentGlobs(readJson(a[0] ?? manifestPath)).map(globToRegExp);
    const hits = fs.readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter((f) => f && res.some((re) => re.test(f)));
    if (hits.length) console.log(hits.join('\n'));
    return 0;
  }
  if (cmd === 'receipt') { const p = parseReceipt(fs.readFileSync(0, 'utf8')); console.log(JSON.stringify(p.receipt ?? { error: p.error })); return p.receipt ? 0 : 1; }
  console.error('usage: review-gate.mjs check | splice <body> <receipt.json> | link <body> <receipt.json> <url> | models | globs | touched [manifest] | receipt');
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.log(`::error::review gate failed: ${clean(e.message, 300)}`); process.exit(1); });
}

// Every agents/*.md: frontmatter keys are Claude Code agent fields, name matches its file name,
// description is short and says when to use it, tools are read-only (review agents never edit).
// The review roster (design-review-*, qa-review-*, and the two stack reviewers) additionally keeps the four
// section headings, the standing clause, an explicit disallowedTools, and none of the upstream Engine's machinery.
// The three reviewers the review skill launches keep identical copies of their shared lines (#45, #69).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { kitRoot } from './lib/fs.mjs';
import { split } from './lib/frontmatter.mjs';

const agentsDir = path.join(kitRoot, 'agents');

// The Claude Code plugin reference's agent fields, exactly. Plugin agents may not set hooks, mcpServers or
// permissionMode, and color is not a plugin field.
const ALLOWED_KEYS = new Set(['name', 'description', 'model', 'effort', 'maxTurns', 'tools', 'disallowedTools',
  'skills', 'memory', 'background', 'omitClaudeMd', 'isolation']);
const EDITING_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
const MUST_DISALLOW = ['Write', 'Edit', 'NotebookEdit'];

// Files that must carry an explicit disallowedTools and the shared body shape.
const ROSTER = /^(design-review-|qa-review-|prisma-migration-reviewer$|storefront-extension-reviewer$)/;
const HEADINGS = ['## Mandate', '## How you work', '## What you produce', '## Boundaries'];
// One stable sentence from the standing clause every roster persona keeps.
const STANDING_CLAUSE = 'finds nothing because it did not look hard is a failure';
const OPERATOR_DECIDES = /you report; the operator decides/i;
// A subagent reads only its own file, so these lines are copies held identical here. The input contract is true for
// every launcher: the review skill passes the context inline, release-readiness passes the range and paths.
const SKILL_REVIEWERS = ['review-correctness', 'review-quality', 'classifier-reviewer'];
const INPUT_CONTRACT = 'You are a subagent. Your prompt carries what the launcher gathered: the manifest or where to read it, the diff or the range to diff, the changed files, and the PR when there is one. Read anything else you need from the checkout; never guess when you can verify in-repo.';
const SHARED = ['## Verdict: block | changes-needed | approve', 'P0 blocks. P1 needs changes before merge. P2 is worth fixing but not blocking. Cite file and line for every finding.'];
// Upstream Engine frontmatter keys and machinery that must not survive the port.
const ENGINE_KEYS = /^(role|lens|model-tier|permissions|reviewer-contract(-version)?|output-contract):/m;
const ENGINE_STRINGS = ['reviewer-contract', 'output-contract', '.engine/', 'review packet'];

const list = (value) => (value ? value.split(',').map((t) => t.trim()).filter(Boolean) : []);

describe('agents parity', () => {
  const files = fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter((n) => n.endsWith('.md')) : [];
  test('there is at least one agent', () => assert.ok(files.length > 0));
  test('the review skill\'s three reviewers exist', () => assert.deepEqual(SKILL_REVIEWERS.filter((n) => files.includes(`${n}.md`)), SKILL_REVIEWERS));
  test('the review roster is complete', () => {
    const roster = files.map((f) => path.basename(f, '.md')).filter((n) => ROSTER.test(n)).sort();
    assert.deepEqual(roster, [
      'design-review-architecture', 'design-review-feasibility', 'design-review-product-intent', 'design-review-risk-governance',
      'prisma-migration-reviewer',
      'qa-review-divergence-hunter', 'qa-review-security-governance', 'qa-review-spec-conformance',
      'qa-review-technical-integrity', 'qa-review-usability',
      'storefront-extension-reviewer',
    ]);
  });
  for (const f of files) {
    const name = path.basename(f, '.md');
    test(`agents/${f}`, () => {
      const text = fs.readFileSync(path.join(agentsDir, f), 'utf8');
      const { fm, body } = split(text);
      for (const k of Object.keys(fm)) assert.ok(ALLOWED_KEYS.has(k), `unknown frontmatter key ${k}`);
      assert.equal(fm.name, name, 'name === file name');
      assert.ok(fm.description, 'description present');
      assert.ok(fm.description.length <= 1024, `description ≤ 1024 chars (${fm.description.length})`);
      assert.match(fm.description, /Use when/, 'description contains "Use when"');

      // Read-only: either the tool list carries no editing tool, or disallowedTools names all three.
      const tools = list(fm.tools);
      const disallowed = list(fm.disallowedTools);
      const toolsClean = tools.every((t) => !EDITING_TOOLS.includes(t));
      const disallowsAll = MUST_DISALLOW.every((t) => disallowed.includes(t));
      assert.ok(toolsClean || disallowsAll,
        `review agents are read-only: tools must exclude ${EDITING_TOOLS.join('/')} or disallowedTools must include ${MUST_DISALLOW.join(', ')}`);
      if (tools.length === 0 && !disallowsAll) {
        assert.fail(`no tools list: disallowedTools must include ${MUST_DISALLOW.join(', ')}`);
      }

      if (SKILL_REVIEWERS.includes(name)) {
        // The legend applies only to a reviewer that grades [P0]-[P2]; the input contract and verdict line to all three.
        for (const s of [INPUT_CONTRACT, SHARED[0], ...(body.includes('- [P0]') ? [SHARED[1]] : [])]) assert.ok(body.replace(/\s+/g, ' ').includes(s), `${name} keeps the shared line "${s.slice(0, 60)}…"`);
      }
      if (!ROSTER.test(name)) return;
      assert.ok(disallowsAll, `roster agents set disallowedTools including ${MUST_DISALLOW.join(', ')}; found "${fm.disallowedTools ?? ''}"`);
      for (const h of HEADINGS) assert.ok(body.includes(`\n${h}\n`), `body has the heading "${h}"`);
      assert.ok(body.includes(STANDING_CLAUSE), `body keeps the standing clause ("${STANDING_CLAUSE}")`);
      assert.match(body, OPERATOR_DECIDES, 'body says "you report; the operator decides"');
      assert.ok(!ENGINE_KEYS.test(text), 'no Engine-only frontmatter key (role, lens, model-tier, permissions, reviewer-contract, output-contract)');
      for (const s of ENGINE_STRINGS) assert.ok(!text.includes(s), `no Engine machinery reference "${s}"`);
    });
  }
});

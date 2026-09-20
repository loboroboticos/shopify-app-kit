// Every agents/*.md: frontmatter keys are Claude Code agent fields, name matches its file name,
// description is short and says when to use it, tools are read-only (review agents never edit).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const agentsDir = path.resolve(here, '..', 'agents');

const ALLOWED_KEYS = new Set(['name', 'description', 'tools', 'disallowedTools', 'model', 'permissionMode', 'maxTurns',
  'skills', 'mcpServers', 'hooks', 'memory', 'background', 'isolation', 'effort', 'color']);
const EDITING_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  assert.ok(m, 'frontmatter block');
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s/.test(line)) continue;
    const kv = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/);
    assert.ok(kv, `unparseable frontmatter line: ${line}`);
    out[kv[1]] = kv[2].trim();
  }
  return out;
}

describe('agents parity', () => {
  const files = fs.existsSync(agentsDir) ? fs.readdirSync(agentsDir).filter((n) => n.endsWith('.md')) : [];
  test('there is at least one agent', () => assert.ok(files.length > 0));
  for (const f of files) {
    test(`agents/${f}`, () => {
      const fm = frontmatter(fs.readFileSync(path.join(agentsDir, f), 'utf8'));
      for (const k of Object.keys(fm)) assert.ok(ALLOWED_KEYS.has(k), `unknown frontmatter key ${k}`);
      assert.equal(fm.name, path.basename(f, '.md'), 'name === file name');
      assert.ok(fm.description, 'description present');
      assert.ok(fm.description.length <= 1024, `description ≤ 1024 chars (${fm.description.length})`);
      assert.match(fm.description, /Use when/, 'description contains "Use when"');
      if (fm.tools) {
        const tools = fm.tools.split(',').map((t) => t.trim());
        for (const t of tools) assert.ok(!EDITING_TOOLS.includes(t), `review agents are read-only; found ${t}`);
      }
    });
  }
});

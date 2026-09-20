// Every skills/*/SKILL.md: frontmatter keys are Claude Code skill fields, name matches its directory,
// description is short and says when to use it.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(here, '..', 'skills');

const ALLOWED_KEYS = new Set(['name', 'description', 'allowed-tools', 'disallowed-tools', 'disable-model-invocation', 'user-invocable',
  'context', 'agent', 'paths', 'argument-hint', 'arguments', 'model', 'effort', 'license', 'compatibility', 'metadata']);

// Minimal frontmatter reader: top-level `key: value` lines between the first two `---` lines.
// Nested values (metadata:) are folded into their parent key and not interpreted.
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

describe('skills parity', () => {
  const dirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  test('there is at least one skill', () => assert.ok(dirs.length > 0));
  for (const dir of dirs) {
    test(`skills/${dir}/SKILL.md`, () => {
      const file = path.join(skillsDir, dir, 'SKILL.md');
      assert.ok(fs.existsSync(file), 'SKILL.md exists');
      const fm = frontmatter(fs.readFileSync(file, 'utf8'));
      for (const k of Object.keys(fm)) assert.ok(ALLOWED_KEYS.has(k), `unknown frontmatter key ${k}`);
      assert.equal(fm.name, dir, 'name === directory');
      assert.ok(fm.description, 'description present');
      assert.ok(fm.description.length <= 1024, `description ≤ 1024 chars (${fm.description.length})`);
      assert.match(fm.description, /Use when/, 'description contains "Use when"');
      for (const k of ['disable-model-invocation', 'user-invocable']) {
        if (k in fm) assert.match(fm[k], /^(true|false)$/, `${k} is a boolean`);
      }
    });
  }
});

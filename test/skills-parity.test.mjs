// Every skills/*/SKILL.md: frontmatter keys are Claude Code skill fields, name matches its directory,
// description is short and says when to use it. A skill may carry a references/ directory of plain markdown
// (progressive disclosure): every reference file is linked from its SKILL.md, has no frontmatter, ends with a
// `Sources:` line naming only the neutral lesson sources, and the SKILL.md itself stays short.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const skillsDir = path.resolve(here, '..', 'skills');

const ALLOWED_KEYS = new Set(['name', 'description', 'allowed-tools', 'disallowed-tools', 'disable-model-invocation', 'user-invocable',
  'context', 'agent', 'paths', 'argument-hint', 'arguments', 'model', 'effort', 'license', 'compatibility', 'metadata']);
const ALLOWED_ENTRIES = new Set(['SKILL.md', 'references']);
const SOURCE_LABELS = new Set(['app-1', 'app-2', 'app-3']);
// A SKILL.md with references/ is the short entry point; the depth lives in the references.
const MAX_SKILL_LINES_WITH_REFERENCES = 60;

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
    const skillDir = path.join(skillsDir, dir);
    const file = path.join(skillDir, 'SKILL.md');
    const refsDir = path.join(skillDir, 'references');
    test(`skills/${dir}/SKILL.md`, () => {
      assert.ok(fs.existsSync(file), 'SKILL.md exists');
      for (const entry of fs.readdirSync(skillDir)) {
        assert.ok(ALLOWED_ENTRIES.has(entry), `skills/${dir}/${entry}: only SKILL.md and references/ belong in a skill directory`);
      }
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
    if (!fs.existsSync(refsDir)) continue;
    test(`skills/${dir}/references/`, () => {
      const skill = fs.readFileSync(file, 'utf8');
      const lines = skill.split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === '')).length;
      assert.ok(lines <= MAX_SKILL_LINES_WITH_REFERENCES,
        `skills/${dir}/SKILL.md is ${lines} lines; keep it ≤ ${MAX_SKILL_LINES_WITH_REFERENCES} and move depth into references/`);
      const refs = fs.readdirSync(refsDir);
      assert.ok(refs.length > 0, 'references/ is not empty');
      for (const ref of refs) {
        const refPath = path.join(refsDir, ref);
        assert.ok(fs.statSync(refPath).isFile() && ref.endsWith('.md'), `references/${ref} must be a .md file`);
        assert.ok(skill.includes(`references/${ref}`), `SKILL.md must link references/${ref}`);
        const text = fs.readFileSync(refPath, 'utf8');
        assert.ok(!text.startsWith('---'), `references/${ref} has no frontmatter`);
        assert.match(text, /^# /m, `references/${ref} has a title`);
        const last = text.trimEnd().split(/\r?\n/).pop();
        assert.match(last, /^Sources: /, `references/${ref} ends with a "Sources:" line`);
        const labels = last.match(/app-\d+/g) ?? [];
        assert.ok(labels.length > 0, `references/${ref} Sources line names at least one source label`);
        for (const l of labels) assert.ok(SOURCE_LABELS.has(l), `references/${ref} cites unknown source ${l}`);
      }
    });
  }
});

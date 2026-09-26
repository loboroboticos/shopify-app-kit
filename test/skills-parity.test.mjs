// Every skills/*/SKILL.md: frontmatter keys are Claude Code skill fields, name matches its directory,
// description is short and says when to use it. A skill may carry a references/ directory of plain markdown
// (progressive disclosure): every reference file is linked from its SKILL.md, has no frontmatter, ends with a
// `Sources:` line naming only the neutral lesson sources, and the SKILL.md itself stays short.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { kitRoot } from './lib/fs.mjs';
import { frontmatter } from './lib/frontmatter.mjs';

const skillsDir = path.join(kitRoot, 'skills');

const ALLOWED_KEYS = new Set(['name', 'description', 'allowed-tools', 'disallowed-tools', 'disable-model-invocation', 'user-invocable',
  'context', 'agent', 'paths', 'argument-hint', 'arguments', 'model', 'effort', 'license', 'compatibility', 'metadata']);
// scripts/: zero-dependency .mjs or .sh files a skill runs (only new-app so far); each is linked from its SKILL.md.
const ALLOWED_ENTRIES = new Set(['SKILL.md', 'references', 'scripts']);
// The allowed source labels are the first column of lessons/README.md's Sources table (portfolio ids and the
// founding app-N labels), so a new product's id is added there and nowhere else.
const SOURCE_LABELS = new Set([...fs.readFileSync(path.join(kitRoot, 'lessons', 'README.md'), 'utf8').matchAll(/^\| `([a-z0-9][a-z0-9-]*)` \|/gm)].map((m) => m[1]));
// Every SKILL.md is a short entry point; depth lives in references/ (test/budget.json carries the same cap).
const MAX_SKILL_LINES = 60;
// Maintainer skills document the kit itself: their references are procedures, not lessons, so they carry no
// Sources: line and test/lessons-index.test.mjs does not require them to be a lesson's home.
const MAINTAINER_SKILLS = new Set(['kit-dev']);

describe('skills parity', () => {
  const dirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  test('there is at least one skill', () => assert.ok(dirs.length > 0));
  for (const dir of dirs) {
    const skillDir = path.join(skillsDir, dir);
    const file = path.join(skillDir, 'SKILL.md');
    const refsDir = path.join(skillDir, 'references');
    test(`skills/${dir}/SKILL.md`, () => {
      assert.ok(fs.existsSync(file), 'SKILL.md exists');
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l, i, a) => !(i === a.length - 1 && l === '')).length;
      assert.ok(lines <= MAX_SKILL_LINES, `skills/${dir}/SKILL.md is ${lines} lines; keep it ≤ ${MAX_SKILL_LINES} and move depth into references/`);
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
    const scriptsDir = path.join(skillDir, 'scripts');
    if (fs.existsSync(scriptsDir)) {
      test(`skills/${dir}/scripts/`, () => {
        const skill = fs.readFileSync(file, 'utf8');
        const scripts = fs.readdirSync(scriptsDir);
        assert.ok(scripts.length > 0, 'scripts/ is not empty');
        for (const s of scripts) {
          const p = path.join(scriptsDir, s);
          assert.ok(fs.statSync(p).isFile() && /\.(mjs|sh)$/.test(s), `scripts/${s} must be a .mjs or .sh file`);
          assert.ok(skill.includes(`scripts/${s}`), `SKILL.md must link scripts/${s}`);
          const text = fs.readFileSync(p, 'utf8');
          assert.ok(text.slice(0, 1500).includes(s), `scripts/${s} starts with a comment naming itself and what it does`);
          const r = s.endsWith('.sh') ? spawnSync('bash', ['-n', p], { encoding: 'utf8' }) : spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
          assert.equal(r.status, 0, `scripts/${s}: ${r.stderr}`);
          if (s.endsWith('.sh')) assert.match(text, /^#!\/usr\/bin\/env bash/, `scripts/${s} has a bash shebang`);
          assert.doesNotMatch(text, /^\s*import .* from ['"](?!node:)/m, `scripts/${s} imports only node: builtins (zero dependencies)`);
        }
      });
    }
    if (!fs.existsSync(refsDir)) continue;
    test(`skills/${dir}/references/`, () => {
      const skill = fs.readFileSync(file, 'utf8');
      const refs = fs.readdirSync(refsDir);
      assert.ok(refs.length > 0, 'references/ is not empty');
      for (const ref of refs) {
        const refPath = path.join(refsDir, ref);
        assert.ok(fs.statSync(refPath).isFile() && ref.endsWith('.md'), `references/${ref} must be a .md file`);
        assert.ok(skill.includes(`references/${ref}`), `SKILL.md must link references/${ref}`);
        const text = fs.readFileSync(refPath, 'utf8');
        assert.ok(!text.startsWith('---'), `references/${ref} has no frontmatter`);
        assert.match(text, /^# /m, `references/${ref} has a title`);
        if (MAINTAINER_SKILLS.has(dir)) continue;
        const last = text.trimEnd().split(/\r?\n/).pop();
        assert.match(last, /^Sources: /, `references/${ref} ends with a "Sources:" line`);
        // Labels are the words left after the parenthesised descriptions go: `app-1 (…); p-7 (…).` or `app-2, app-3.`
        const labels = last.slice('Sources:'.length).replace(/\([^()]*\)/g, '').match(/[a-z0-9][a-z0-9-]*/g) ?? [];
        assert.ok(labels.length > 0, `references/${ref} Sources line names at least one source label`);
        for (const l of labels) assert.ok(SOURCE_LABELS.has(l), `references/${ref} cites unknown source ${l}`);
      }
    });
  }
});

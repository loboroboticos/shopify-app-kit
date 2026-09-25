// Minimal frontmatter reader shared by the parity tests: top-level `key: value` lines between the first two
// `---` lines. Nested values (metadata:) are folded into their parent key and not interpreted. Strict mode
// (the default) throws on a missing block or an unparseable line; lenient mode skips such lines and strips
// one pair of surrounding double quotes from a value.
const BLOCK = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;
const LINE = /^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/;

// split(text, { lenient }) -> { fm, body }
export function split(text, { lenient = false } = {}) {
  const m = text.match(BLOCK);
  if (!m) throw new Error('frontmatter block');
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s/.test(line)) continue;
    const kv = line.match(LINE);
    if (!kv) { if (lenient) continue; throw new Error(`unparseable frontmatter line: ${line}`); }
    fm[kv[1]] = lenient ? kv[2].trim().replace(/^"(.*)"$/, '$1') : kv[2].trim();
  }
  return { fm, body: text.slice(m[0].length) };
}

export const frontmatter = (text, opts) => split(text, opts).fm;

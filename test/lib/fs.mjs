// Paths and file walking shared by the tests: the kit root, a recursive walk that skips node_modules and .git,
// and a reader relative to the root. Zero dependencies.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const kitRoot = path.resolve(here, '..', '..');

const SKIP_DIRS = new Set(['node_modules', '.git']);

// walk(dir): every file under dir, depth first, never descending into node_modules or .git.
export function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) yield* walk(p); } else if (entry.isFile()) yield p;
  }
}

// read(...parts): the text of a file named relative to the kit root.
export const read = (...parts) => fs.readFileSync(path.join(kitRoot, ...parts), 'utf8');

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Gzipped budgets in bytes: the entry chunk and all CSS (ARCH-15), and each lazy JS chunk (AIR-13).
const ENTRY_JS_BUDGET = 40 * 1024;
const LAZY_JS_BUDGET = 8 * 1024;
const CSS_BUDGET = 5 * 1024;
const assetsDir = fileURLToPath(new URL('../dist/assets/', import.meta.url));

const kb = (n: number) => (n / 1024).toFixed(1);
const files = readdirSync(assetsDir);
const size = (file: string) => gzipSync(readFileSync(join(assetsDir, file))).length;
const sum = (list: string[]) => list.reduce((total, file) => total + size(file), 0);

// Vite names the entry chunk after index.html; lazy chunks after their module.
const entry = files.filter((f) => f.startsWith('index-') && f.endsWith('.js'));
const lazy = files.filter((f) => !f.startsWith('index-') && f.endsWith('.js'));
const css = files.filter((f) => f.endsWith('.css'));

const checks: [string, number, number][] = [
  ['entry .js', sum(entry), ENTRY_JS_BUDGET],
  ...lazy.map((f): [string, number, number] => [f, size(f), LAZY_JS_BUDGET]),
  ['all .css', sum(css), CSS_BUDGET],
];

let failed = entry.length !== 1;
if (failed) console.log('FAIL expected one entry chunk in dist/assets; run `npm run build` first');

for (const [name, total, budget] of checks) {
  const ok = total <= budget;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(28)} ${kb(total)} KB gzip (budget ${kb(budget)} KB)`,
  );
}

process.exit(failed ? 1 : 0);

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// Gzipped budgets in bytes (ARCH-15).
const BUDGETS = { '.js': 20 * 1024, '.css': 5 * 1024 };
const assetsDir = fileURLToPath(new URL('../dist/assets/', import.meta.url));

const totals = { '.js': 0, '.css': 0 };
for (const file of readdirSync(assetsDir)) {
  const ext = Object.keys(BUDGETS).find((e) => file.endsWith(e));
  if (ext) totals[ext] += gzipSync(readFileSync(join(assetsDir, file))).length;
}

const kb = (n) => (n / 1024).toFixed(1);
let failed = totals['.js'] === 0;
if (failed) console.log('FAIL no JS assets found in dist/assets; run `npm run build` first');

for (const [ext, budget] of Object.entries(BUDGETS)) {
  const ok = totals[ext] <= budget;
  failed ||= !ok;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${ext.padEnd(4)} ${kb(totals[ext])} KB gzip (budget ${kb(budget)} KB)`,
  );
}

process.exit(failed ? 1 : 0);

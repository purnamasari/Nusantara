// CLI: node tools/check-budgets.ts [distDir]. Fails (exit 1) when any budget is exceeded.

import { join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBudgets } from './budgets.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(ROOT, 'dist');
const result = checkBudgets(distDir, join(ROOT, 'public', 'regions'));

for (const r of result.rows) {
  const limit = r.limit === null ? '' : ` / ${r.limit}`;
  console.log(`${r.budget.padEnd(24)} ${r.item.padEnd(40)} ${String(r.measured).padStart(8)}${limit}`);
}
for (const w of result.warnings) console.warn(`WARN  ${w}`);
for (const f of result.failures) console.error(`FAIL  ${f}`);
if (result.failures.length > 0) process.exit(1);
console.log('All size budgets within limits.');

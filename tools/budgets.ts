// Size budgets (plan §10.1). KB = 1,024 bytes. Measured on the production build.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';

export const LIMITS = {
  initialJsGzip: 409_600,
  cssGzip: 20_480,
  regionDataBytes: 102_400,
  mediaFiles: 0,
} as const;

const MEDIA_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.bmp', '.glb', '.gltf', '.obj', '.fbx', '.mp3', '.ogg', '.wav', '.m4a', '.aac', '.flac', '.woff', '.woff2', '.ttf', '.otf']);
const ALLOWED_MEDIA = new Set(['favicon.svg']);
export const TEST_HOOK_MARKER = '__otherworld';

export interface BudgetRow {
  budget: string;
  item: string;
  measured: number;
  limit: number | null;
}

export interface BudgetResult {
  rows: BudgetRow[];
  failures: string[];
  warnings: string[];
}

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

export function gzipSize(path: string): number {
  return gzipSync(readFileSync(path), { level: 9 }).byteLength;
}

/** JS files loaded by index.html: module scripts plus modulepreload links. */
export function initialJsFiles(distDir: string): string[] {
  const html = readFileSync(join(distDir, 'index.html'), 'utf8');
  const refs = new Set<string>();
  for (const m of html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)) refs.add(m[1]!);
  for (const m of html.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+)"/g)) refs.add(m[1]!);
  return [...refs].map((ref) => {
    const clean = ref.replace(/^https?:\/\/[^/]+/, '');
    const assetIdx = clean.indexOf('assets/');
    const rel = assetIdx >= 0 ? clean.slice(assetIdx) : clean.replace(/^\.?\//, '');
    return join(distDir, rel);
  });
}

export function checkBudgets(distDir: string, regionsDir: string): BudgetResult {
  const rows: BudgetRow[] = [];
  const failures: string[] = [];
  const warnings: string[] = [];
  const check = (budget: string, measured: number, limit: number) => {
    if (measured > limit) failures.push(`${budget}: ${measured} B exceeds ${limit} B`);
    else if (limit > 0 && measured > limit * 0.9) warnings.push(`${budget}: ${measured} B is above 90% of ${limit} B`);
  };

  if (!existsSync(join(distDir, 'index.html'))) {
    return { rows, failures: [`no production build found at ${distDir} (run npm run build)`], warnings };
  }

  let js = 0;
  for (const f of initialJsFiles(distDir)) {
    if (!existsSync(f)) {
      failures.push(`index.html references missing file ${relative(distDir, f)}`);
      continue;
    }
    const size = gzipSize(f);
    js += size;
    rows.push({ budget: 'initial JS (gzip -9)', item: relative(distDir, f), measured: size, limit: null });
  }
  rows.push({ budget: 'initial JS (gzip -9)', item: 'TOTAL', measured: js, limit: LIMITS.initialJsGzip });
  check('initial JS', js, LIMITS.initialJsGzip);

  const all = walk(distDir);
  const css = all.filter((f) => f.endsWith('.css')).reduce((s, f) => s + gzipSize(f), 0);
  rows.push({ budget: 'CSS (gzip -9)', item: 'TOTAL', measured: css, limit: LIMITS.cssGzip });
  check('CSS', css, LIMITS.cssGzip);

  if (existsSync(regionsDir)) {
    for (const region of readdirSync(regionsDir)) {
      const dir = join(regionsDir, region);
      if (!statSync(dir).isDirectory()) continue;
      const bytes = walk(dir).reduce((s, f) => s + statSync(f).size, 0);
      rows.push({ budget: 'region data (raw)', item: region, measured: bytes, limit: LIMITS.regionDataBytes });
      check(`region data ${region}`, bytes, LIMITS.regionDataBytes);
    }
  }

  const media = all.filter((f) => MEDIA_EXT.has(extname(f).toLowerCase()) && !ALLOWED_MEDIA.has(relative(distDir, f)));
  rows.push({ budget: 'downloaded media files', item: 'count', measured: media.length, limit: LIMITS.mediaFiles });
  if (media.length > LIMITS.mediaFiles) failures.push(`media files present: ${media.map((f) => relative(distDir, f)).join(', ')}`);

  const hooked = all.filter((f) => f.endsWith('.js') && readFileSync(f, 'utf8').includes(TEST_HOOK_MARKER));
  if (hooked.length > 0) failures.push(`test hooks (${TEST_HOOK_MARKER}) found in production bundle: ${hooked.map((f) => relative(distDir, f)).join(', ')}`);

  return { rows, failures, warnings };
}

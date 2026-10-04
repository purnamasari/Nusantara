import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkBudgets, LIMITS } from '../../tools/budgets.ts';
import { ROOT } from './helpers.ts';

const ALLOWED_RUNTIME = ['react', 'react-dom', 'three'];

// Plan §11.2: imports only point down. Directory → directories it may import from.
const LAYER_RULES: Record<string, string[]> = {
  lib: ['lib'],
  geo: ['lib', 'geo'],
  heightmap: ['lib', 'geo', 'heightmap'],
  content: ['lib', 'geo', 'content'],
  terrain: ['lib', 'geo', 'heightmap', 'content', 'terrain'],
  rules: ['lib', 'geo', 'content', 'rules'],
  bridge: ['lib', 'content', 'rules', 'bridge'],
  engine: ['lib', 'geo', 'heightmap', 'content', 'terrain', 'rules', 'bridge', 'engine'],
  ui: ['bridge', 'ui'],
};
const DETERMINISTIC = ['lib', 'geo', 'heightmap', 'content', 'terrain', 'rules'];
const BANNED = /\bMath\.random\s*\(|\bDate\.now\s*\(|\bnew Date\s*\(|\bperformance\.now\s*\(/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Returns import-rule violations for one file's source. */
export function importViolations(file: string, src: string): string[] {
  const rel = relative(join(ROOT, 'src'), file).split(sep);
  const layer = rel.length > 1 ? rel[0]! : 'main';
  const out: string[] = [];
  for (const m of stripComments(src).matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = (m[1] ?? m[2])!;
    if (spec.startsWith('.')) {
      const target = relative(join(ROOT, 'src'), join(dirname(file), spec)).split(sep);
      if (target[0] === '..') {
        out.push(`${rel.join('/')} imports outside src: ${spec}`);
        continue;
      }
      const tLayer = target.length > 1 ? target[0]! : 'main';
      if (layer !== 'main' && !LAYER_RULES[layer]?.includes(tLayer)) out.push(`${rel.join('/')} (${layer}) may not import ${tLayer}: ${spec}`);
    } else {
      if (spec.startsWith('node:')) out.push(`${rel.join('/')} imports Node API ${spec}`);
      if (spec.startsWith('three') && layer !== 'engine') out.push(`${rel.join('/')} (${layer}) may not import three.js`);
      if (spec.startsWith('react') && layer !== 'ui' && layer !== 'main') out.push(`${rel.join('/')} (${layer}) may not import React`);
    }
  }
  return out;
}

export function bannedApiViolations(file: string, src: string): string[] {
  const rel = relative(join(ROOT, 'src'), file).split(sep);
  if (!DETERMINISTIC.includes(rel[0]!)) return [];
  return BANNED.test(stripComments(src)) ? [`${rel.join('/')} uses a banned non-deterministic API`] : [];
}

const srcFiles = walk(join(ROOT, 'src')).filter((f) => /\.(ts|tsx)$/.test(f));

describe('dependency guardrails (plan §11)', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it('runtime dependencies are exactly three, react, react-dom, pinned exactly', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(ALLOWED_RUNTIME);
    for (const v of Object.values(pkg.dependencies)) expect(v).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('src imports respect the layer rules', () => {
    const violations = srcFiles.flatMap((f) => importViolations(f, readFileSync(f, 'utf8')));
    expect(violations).toEqual([]);
  });

  it('src never imports tools/', () => {
    for (const f of srcFiles) expect(readFileSync(f, 'utf8')).not.toMatch(/from ['"][^'"]*tools\//);
  });

  it('deterministic layers avoid Math.random, Date and performance.now', () => {
    expect(srcFiles.flatMap((f) => bannedApiViolations(f, readFileSync(f, 'utf8')))).toEqual([]);
  });

  it('the checks catch planted violations', () => {
    const ui = join(ROOT, 'src', 'ui', 'Planted.tsx');
    expect(importViolations(ui, "import { Mesh } from 'three';")).toHaveLength(1);
    expect(importViolations(ui, "import { x } from '../engine/Game.ts';")).toHaveLength(1);
    const lib = join(ROOT, 'src', 'lib', 'planted.ts');
    expect(importViolations(lib, "import { y } from '../terrain/pipeline.ts';")).toHaveLength(1);
    expect(bannedApiViolations(join(ROOT, 'src', 'terrain', 'planted.ts'), 'const r = Math.random();')).toHaveLength(1);
    expect(bannedApiViolations(join(ROOT, 'src', 'engine', 'planted.ts'), 'const r = Math.random();')).toHaveLength(0);
  });
});

describe('size budget checker (plan §10.1)', () => {
  function fakeDist(jsBytes: number, extra: Record<string, string | Buffer> = {}): { dist: string; regions: string } {
    const root = mkdtempSync(join(tmpdir(), 'budget-'));
    const dist = join(root, 'dist');
    mkdirSync(join(dist, 'assets'), { recursive: true });
    writeFileSync(join(dist, 'index.html'), '<script type="module" crossorigin src="/assets/index-abc.js"></script>');
    // Random bytes do not compress, so gzip size ≈ raw size.
    writeFileSync(join(dist, 'assets', 'index-abc.js'), randomBytes(jsBytes));
    for (const [name, content] of Object.entries(extra)) {
      mkdirSync(dirname(join(dist, name)), { recursive: true });
      writeFileSync(join(dist, name), content);
    }
    const regions = join(root, 'regions');
    mkdirSync(join(regions, 'bandung'), { recursive: true });
    writeFileSync(join(regions, 'bandung', 'height.u8.bin'), Buffer.alloc(65536));
    return { dist, regions };
  }

  it('passes a small build', () => {
    const { dist, regions } = fakeDist(10_000);
    expect(checkBudgets(dist, regions).failures).toEqual([]);
  });

  it('fails an oversized initial JS bundle', () => {
    const { dist, regions } = fakeDist(LIMITS.initialJsGzip + 20_000);
    expect(checkBudgets(dist, regions).failures.some((f) => f.startsWith('initial JS'))).toBe(true);
  });

  it('fails oversized region data, media files and leaked test hooks', () => {
    const { dist, regions } = fakeDist(1000, { 'assets/tree.png': 'x', 'assets/hook.js': 'window.__otherworld = 1' });
    writeFileSync(join(regions, 'bandung', 'extra.bin'), Buffer.alloc(LIMITS.regionDataBytes));
    const failures = checkBudgets(dist, regions).failures;
    expect(failures.some((f) => f.startsWith('region data'))).toBe(true);
    expect(failures.some((f) => f.startsWith('media files'))).toBe(true);
    expect(failures.some((f) => f.startsWith('test hooks'))).toBe(true);
  });
});

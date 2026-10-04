import { expect, test } from '@playwright/test';
import { api, frames, startGame, trackErrors } from './fixtures.ts';
import { GOLDEN_BANDUNG } from '../unit/golden.ts';

interface Info {
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

// Plan §10.1: counts only. Headless Chromium renders in software, so no FPS judgement here.
const CI_POSES = [0, 1, 3, 4, 5];

test('draw calls and triangles stay within budget at the CI poses (M7)', async ({ page }) => {
  const errors = trackErrors(page);
  await startGame(page);
  const report: Record<string, Info> = {};
  for (const pose of CI_POSES) {
    await api(page, 'setPose', pose);
    await frames(page, 3);
    const info = await api<Info>(page, 'rendererInfo');
    report[pose] = info;
    expect(info.calls, `pose ${pose} draw calls`).toBeLessThanOrEqual(150);
    expect(info.triangles, `pose ${pose} triangles`).toBeLessThanOrEqual(600_000);
    expect(info.textures).toBe(0);
  }
  console.log('pose counts', JSON.stringify(report));
  await api(page, 'setPose', null);
  expect(errors).toEqual([]);
});

test('reloading the region three times does not leak GPU resources (M7)', async ({ page }) => {
  await startGame(page);
  await api(page, 'setPose', 5);
  await frames(page, 3);
  // Baseline after one warm reload at the same pose: counts only include what has been drawn.
  await api(page, 'reloadRegion');
  await frames(page, 3);
  const base = await api<Info>(page, 'rendererInfo');
  for (let i = 0; i < 3; i++) {
    await api(page, 'reloadRegion');
    await frames(page, 3);
    const info = await api<Info>(page, 'rendererInfo');
    expect(info.geometries, `reload ${i + 1}`).toBe(base.geometries);
    expect(info.textures, `reload ${i + 1}`).toBe(base.textures);
  }
});

test('Chromium generates the same heightfield as Node (plan §8.3)', async ({ page }) => {
  await startGame(page);
  expect(await api<string>(page, 'heightfieldHash')).toBe(GOLDEN_BANDUNG.heights);
});

test('the HUD does not re-render while nothing changes (M5)', async ({ page }) => {
  await startGame(page);
  await api(page, 'warpTo', 'spawn');
  await frames(page, 10);
  const before = await page.evaluate(() => window.__otherworldHudRenders ?? 0);
  await frames(page, 20);
  const after = await page.evaluate(() => window.__otherworldHudRenders ?? 0);
  expect(after - before).toBeLessThanOrEqual(1);
});

declare global {
  interface Window {
    __otherworldHudRenders?: number;
  }
}

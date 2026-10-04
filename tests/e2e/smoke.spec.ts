import { expect, test } from '@playwright/test';
import { frames, startGame, state, trackErrors } from './fixtures.ts';

test('boots to the start screen, then into Bandung with a rendered canvas and no errors (M0/M1)', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Archipelago: Otherworld' })).toBeVisible();
  await expect(page.locator('#game canvas')).toHaveCount(1);
  await expect(page.locator('button.primary')).toHaveText('Play');
  await startGame(page);
  await expect(page.locator('.hud-region-name')).toHaveText('Bandung');
  await expect(page.getByTestId('progress')).toHaveText('0 / 5');
  const s = await state(page);
  expect(s.mode).toBe('walk');
  expect(Math.abs(s.player.y - s.surfaceY)).toBeLessThan(1e-3);
  // Canvas actually draws something other than the clear colour.
  await frames(page, 2);
  const shot = await page.locator('#game canvas').screenshot();
  expect(shot.byteLength).toBeGreaterThan(20_000);
  expect(errors).toEqual([]);
});

test('keyboard F takes off and lands; walking moves the player (M2/M3)', async ({ page }) => {
  const errors = trackErrors(page);
  await startGame(page);
  const before = await state(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyW');
  const moved = await state(page);
  expect(Math.hypot(moved.player.x - before.player.x, moved.player.z - before.player.z)).toBeGreaterThan(1);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => (window as never as { __otherworld: { getState(): { mode: string } } }).__otherworld.getState().mode === 'fly');
  await expect(page.getByTestId('mode')).toContainText('Flying');
  const flying = await state(page);
  expect(flying.player.y - flying.surfaceY).toBeGreaterThanOrEqual(1.99);
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => (window as never as { __otherworld: { getState(): { mode: string } } }).__otherworld.getState().mode === 'walk', null, { timeout: 30_000 });
  const landed = await state(page);
  expect(Math.abs(landed.player.y - landed.surfaceY)).toBeLessThan(1e-3);
  expect(errors).toEqual([]);
});

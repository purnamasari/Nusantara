import { expect, test } from '@playwright/test';
import { api, frames, SPIRITS, startGame, state, trackErrors } from './fixtures.ts';

test('progress and position survive reloads (M6)', async ({ page }) => {
  const errors = trackErrors(page);
  await startGame(page);
  for (const id of SPIRITS.slice(0, 3)) {
    await api(page, 'warpTo', id);
    await frames(page);
    await api(page, 'interact');
  }
  await expect(page.getByTestId('progress')).toHaveText('3 / 5');
  await api(page, 'warpTo', { x: 120, z: 40 });
  await frames(page);
  const saved = await state(page);
  await api(page, 'saveNow');

  await page.reload();
  await expect(page.locator('button.primary')).toHaveText('Continue');
  await page.locator('button.primary').click();
  await page.waitForFunction(() => (window as never as { __otherworld?: { getState(): { screen: string } } }).__otherworld?.getState().screen === 'playing');
  await frames(page);
  const restored = await state(page);
  expect(restored.collected.sort()).toEqual([...SPIRITS.slice(0, 3)].sort());
  await expect(page.getByTestId('progress')).toHaveText('3 / 5');
  expect(Math.hypot(restored.player.x - saved.player.x, restored.player.z - saved.player.z)).toBeLessThan(1);
  const remaining = (await api<{ collectibles: { id: string }[] }>(page, 'getState')).collectibles.map((c) => c.id);
  expect(remaining).toEqual(expect.arrayContaining([...SPIRITS]));

  for (const id of SPIRITS.slice(3)) {
    await api(page, 'warpTo', id);
    await frames(page);
    await api(page, 'interact');
  }
  await expect(page.getByTestId('progress')).toHaveText('5 / 5');
  await page.reload();
  await page.locator('button.primary').click();
  await page.waitForFunction(() => (window as never as { __otherworld?: { getState(): { screen: string } } }).__otherworld?.getState().screen === 'playing');
  await frames(page);
  await expect(page.getByTestId('progress')).toHaveText('5 / 5');
  expect((await state(page)).portalActive).toBe(true);
  expect(errors).toEqual([]);
});

test('a corrupt save is backed up and the game starts fresh with a notice', async ({ page }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('otherworld.save', '{broken');
      sessionStorage.setItem('seeded', '1');
    }
  });
  await startGame(page);
  await expect(page.getByTestId('toast').first()).toContainText("couldn't be read");
  expect(await page.evaluate(() => localStorage.getItem('otherworld.save.backup'))).toBe('{broken');
  await expect(page.getByTestId('progress')).toHaveText('0 / 5');
});

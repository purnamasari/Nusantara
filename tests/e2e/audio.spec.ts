import { expect, test } from '@playwright/test';
import { api, frames, SPIRITS, startGame, trackErrors } from './fixtures.ts';

interface AudioState {
  state: string;
  scheduledNotes: number;
  ducked: boolean;
  volumes: { music: number; sfx: number };
  buffers: number;
}

test('procedural music plays, volume persists, and the music ducks behind the gate menu', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.locator('#vol-music').fill('40');
  await expect(page.locator('output[for="vol-music"]')).toHaveText('40');

  await startGame(page); // reloads the page: the setting must survive
  await expect(page.locator('#vol-music')).toHaveCount(0);
  await page.waitForFunction(
    () => (window as never as { __otherworld: { audioState(): { scheduledNotes: number } } }).__otherworld.audioState().scheduledNotes > 8,
    null,
    { timeout: 30_000 },
  );
  const playing = await api<AudioState>(page, 'audioState');
  expect(playing.state).toBe('running');
  expect(playing.volumes.music).toBeCloseTo(0.4, 5);
  expect(playing.ducked).toBe(false);
  expect(playing.buffers).toBeGreaterThan(0);

  for (const id of SPIRITS) {
    await api(page, 'warpTo', id);
    await frames(page, 1);
    await api(page, 'interact');
  }
  await api(page, 'warpTo', 'portal');
  await frames(page);
  await page.keyboard.press('KeyE');
  await expect(page.getByRole('heading', { name: 'The Petal Gate' })).toBeVisible();
  await frames(page, 2);
  expect((await api<AudioState>(page, 'audioState')).ducked).toBe(true);
  expect(errors).toEqual([]);
});

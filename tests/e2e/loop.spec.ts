import { expect, test } from '@playwright/test';
import { api, frames, SPIRITS, startGame, state, trackErrors } from './fixtures.ts';

test('collect all five Flora Spirits, awaken the Petal Gate, open the Teleport menu (M5)', async ({ page }) => {
  const errors = trackErrors(page);
  await startGame(page);

  // Sealed portal before completion.
  await api(page, 'warpTo', 'portal');
  await frames(page);
  await expect(page.getByTestId('prompt')).toContainText('sealed: 0 / 5');
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('toast').last()).toContainText('sealed');
  expect((await state(page)).screen).toBe('playing');

  for (let i = 0; i < SPIRITS.length; i++) {
    await api(page, 'warpTo', SPIRITS[i]);
    await frames(page);
    await expect(page.getByTestId('prompt')).toContainText('Collect');
    if (i === 0) await page.keyboard.press('KeyE');
    else await api(page, 'interact');
    await expect(page.getByTestId('progress')).toHaveText(`${i + 1} / 5`);
    // Idempotent: a second interact on the same spot collects nothing more.
    await api(page, 'interact');
    await frames(page);
    expect((await state(page)).collected).toHaveLength(i + 1);
  }
  await expect(page.getByText('the Petal Gate awakens')).toBeVisible();
  expect((await state(page)).portalActive).toBe(true);
  await expect(page.locator('.hud-portal')).toBeVisible();

  await api(page, 'warpTo', 'portal');
  await frames(page);
  await expect(page.getByTestId('prompt')).toContainText('Enter the Petal Gate');
  await page.keyboard.press('KeyE');
  await expect(page.getByRole('heading', { name: 'The Petal Gate' })).toBeVisible();
  await expect(page.getByTestId('status-bandung')).toHaveText('Completed');
  await expect(page.getByTestId('status-jakarta')).toHaveText('Unlocked');
  await expect(page.getByTestId('dest-jakarta')).toContainText('Not yet available in this build');
  await expect(page.getByTestId('dest-jakarta').getByRole('button')).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Click to resume')).toBeVisible();
  await page.getByText('Click to resume').click();
  await page.waitForFunction(() => (window as never as { __otherworld: { getState(): { screen: string } } }).__otherworld.getState().screen === 'playing');
  expect(errors).toEqual([]);
});

test('interaction is locked during a mode transition (plan §12.4)', async ({ page }) => {
  await startGame(page);
  await api(page, 'warpTo', SPIRITS[1]);
  await frames(page);
  await api(page, 'toggleMode');
  await frames(page, 1);
  const s = await state(page);
  expect(s.player.interactionLock).toBeGreaterThan(0);
  await api(page, 'interact');
  expect((await state(page)).collected).toHaveLength(0);
});

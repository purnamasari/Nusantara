import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const SPIRITS = [
  'bandung.flora.orchid',
  'bandung.flora.lotus',
  'bandung.flora.jasmine',
  'bandung.flora.rose',
  'bandung.flora.hibiscus',
] as const;

/** Collects console errors and uncaught exceptions; tests assert the list stays empty. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

type Api = Record<string, (...args: unknown[]) => unknown>;

export async function api<T>(page: Page, method: string, ...args: unknown[]): Promise<T> {
  return page.evaluate(
    ([m, a]) => (window as unknown as { __otherworld: Api }).__otherworld[m as string]!(...(a as unknown[])),
    [method, args] as const,
  ) as Promise<T>;
}

export async function frames(page: Page, n = 2): Promise<void> {
  for (let i = 0; i < n; i++) await api(page, 'nextFrame');
}

export async function startGame(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Archipelago: Otherworld' })).toBeVisible();
  await page.locator('button.primary').click();
  await page.waitForFunction(() => (window as unknown as { __otherworld?: { getState(): { screen: string } } }).__otherworld?.getState().screen === 'playing');
  await frames(page);
}

export interface GameState {
  screen: string;
  mode: string;
  collected: string[];
  portalActive: boolean;
  player: { x: number; y: number; z: number; interactionLock: number };
  surfaceY: number;
}

export const state = (page: Page) => api<GameState>(page, 'getState');

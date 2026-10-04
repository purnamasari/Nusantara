import { expect, test } from '@playwright/test';

test('a missing heightmap shows the error screen with HEIGHTMAP_FETCH_FAILED (M8)', async ({ page }) => {
  await page.route('**/regions/bandung/height.u8.bin', (route) => route.fulfill({ status: 404, body: 'missing' }));
  await page.goto('/');
  await page.locator('button.primary').click();
  await expect(page.getByTestId('error-code')).toHaveText('HEIGHTMAP_FETCH_FAILED');
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
});

test('corrupt heightmap metadata shows HEIGHTMAP_INVALID', async ({ page }) => {
  await page.route('**/regions/bandung/height.json', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"schemaVersion": 9}' }));
  await page.goto('/');
  await page.locator('button.primary').click();
  await expect(page.getByTestId('error-code')).toHaveText('HEIGHTMAP_INVALID');
});

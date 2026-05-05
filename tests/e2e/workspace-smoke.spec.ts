import { expect, test } from '@playwright/test';

test('workspace shell renders core actions', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByLabel('Foliole workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: 'New' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Notes' })).toBeVisible();
});

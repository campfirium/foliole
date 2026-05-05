import { expect, test } from '@playwright/test';

test('executes remapped command hotkey from persisted keymap override', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem(
      'foliole-command-shortcut-overrides',
      JSON.stringify({
        'workspace.openSettings': 'Alt+S'
      })
    );
  });

  await page.goto('/');

  await page.keyboard.press('Alt+s');

  await expect(page.getByRole('dialog', { name: 'Settings dialog' })).toBeVisible();
});

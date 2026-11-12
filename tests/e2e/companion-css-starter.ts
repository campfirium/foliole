import { expect, test } from '@playwright/test';

import { loadBuiltCompanionFixture } from './companionBuiltSettingsFixture';

for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
  test(`applies and removes global CSS across reading and settings at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const appearance = page.getByRole('button', { name: /Appearance/ });
    await loadBuiltCompanionFixture(page, 'companionTextScale', appearance);
    await appearance.click();

    const example = page.getByRole('listitem').filter({ hasText: 'CSS Example' });
    await expect(example.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await example.getByRole('button', { name: 'Edit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Edit custom style' });
    const css = dialog.getByRole('textbox', { name: 'CSS' });
    const save = dialog.getByRole('button', { name: 'Save' });
    await expect(dialog).toBeInViewport({ ratio: 1 });
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await css.fill(`${(await css.inputValue()).replace('color: #4f7fd1', 'color: #336699')}
:root { --custom-passage-size: 24px; }
.cm-line { font-size: var(--custom-passage-size) !important; }
[data-testid="companion-custom-css-settings"] h3 { color: #336699; }`);
    await save.scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeInViewport();
    await save.click();
    await expect(dialog).toHaveCount(0);
    await expect(example.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await example.getByRole('switch', { name: 'Enable' }).click();
    await expect(example.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    await loadBuiltCompanionFixture(page, 'companionTextScale', appearance);
    await appearance.click();
    const settingsTitle = page.getByRole('heading', { name: 'Custom CSS snippets' });
    await expect(settingsTitle).toHaveCSS('color', 'rgb(51, 102, 153)');
    await page.getByRole('button', { name: 'Back to settings' }).click();

    for (const name of ['Open reading passage', 'Open Flow passage', 'Open review item']) {
      await page.getByRole('button', { name }).click();
      await expect(page.locator('.cm-line-h1').filter({ hasText: 'Heading' })).toHaveCSS('color', 'rgb(51, 102, 153)');
      await expect(page.locator('.cm-line').filter({ hasText: 'A reading passage' })).toHaveCSS('font-size', '24px');
      if (name === 'Open review item') {
        await expect(page.locator('.cm-line').filter({ hasText: 'A review answer.' })).toHaveCSS('font-size', '24px');
      }
      await page.getByRole('button', { name: 'Close passage' }).click();
    }

    await appearance.click();
    await example.getByRole('switch', { name: 'Disable' }).click();
    await expect(settingsTitle).not.toHaveCSS('color', 'rgb(51, 102, 153)');
  });
}

import { expect, test } from '@playwright/test';

import { loadBuiltCompanionFixture } from './companionBuiltSettingsFixture';

for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
  test(`edits the CSS example and colors a Topic heading at ${viewport.width}x${viewport.height}`, async ({ page }) => {
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
    await css.fill((await css.inputValue()).replace('color: #4f7fd1', 'color: #336699'));
    await save.scrollIntoViewIfNeeded();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeInViewport();
    await save.click();
    await expect(dialog).toHaveCount(0);
    await expect(example.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
    await example.getByRole('switch', { name: 'Enable' }).click();
    await expect(example.getByRole('switch')).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('button', { name: 'Back to settings' }).click();
    await page.getByRole('button', { name: 'Open reading passage' }).click();
    await expect(page.locator('.cm-line-h1').filter({ hasText: 'Heading' })).toHaveCSS('color', 'rgb(51, 102, 153)');
  });
}

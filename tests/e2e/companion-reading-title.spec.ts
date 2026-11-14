import { expect, test } from '@playwright/test';

import { loadBuiltCompanionFixture } from './companionBuiltSettingsFixture';

for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
  test(`centers the topic title without individual CSS translation at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const open = page.getByRole('button', { name: 'Open reading passage' });
    await loadBuiltCompanionFixture(page, 'companionTextScale', open);
    await open.click();
    await page.getByText('A reading passage with', { exact: false }).click();

    const toolbar = page.locator('.companion-reading-top-chrome');
    const title = toolbar.getByText('Reading passage', { exact: true });
    await expect(title).toBeVisible();
    // Simulate a WebView that ignores the individual translate property.
    await page.addStyleTag({ content: '* { translate: none !important; }' });

    const box = await title.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(1);
    await expect(title).toHaveCSS('text-align', 'center');
    await expect(title).toHaveCSS('text-overflow', 'ellipsis');
    for (const button of await toolbar.getByRole('button').all()) {
      const hitTarget = await button.boundingBox();
      expect(hitTarget).not.toBeNull();
      expect(hitTarget!.x + hitTarget!.width <= box!.x || hitTarget!.x >= box!.x + box!.width).toBe(true);
    }
  });
}

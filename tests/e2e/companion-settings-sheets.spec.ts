import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test } from '@playwright/test';

for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 812 }, { width: 812, height: 375 }]) {
  test(`keeps settings sheets and their actions inside ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/__settings-sheets', route => route.fulfill({ contentType: 'text/html', body: `
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/@fs/${process.cwd()}/tests/fixtures/companionSettingsSheets.tsx');
      </script></body></html>` }));
    await page.goto('/__settings-sheets');
    const directory = path.resolve('dist/companion/assets');
    const stylesheet = readdirSync(directory).find(name => /^index-.*\.css$/.test(name));
    if (!stylesheet) throw new Error('Run npm run android:web:build before this test.');
    await expect(page.getByRole('button', { name: 'Days: 30', exact: true })).toBeVisible();
    await page.locator('style').evaluateAll(styles => styles.forEach(style => style.remove()));
    await page.addStyleTag({ content: readFileSync(path.join(directory, stylesheet), 'utf8') });
    await page.getByRole('button', { name: 'Mark ready to clean', exact: true }).click();
    for (const name of ['Days: 30', 'Backup location', 'Clean up', 'Clear App Data']) {
      await page.getByRole('button', { name, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      expect(await dialog.evaluate(e => e.scrollWidth <= e.clientWidth)).toBe(true);
      if (name === 'Days: 30') {
        await expect(dialog.getByRole('textbox')).toHaveCount(0);
        await expect(dialog.getByRole('radio', { name: '30 days', exact: true })).toBeChecked();
        await dialog.getByRole('radio', { name: 'Custom days', exact: true }).check();
        await expect(dialog.getByRole('textbox')).not.toBeFocused();
      }
      if (name === 'Clear App Data') await expect(dialog.getByRole('button', { name, exact: true })).toHaveText(name);
      const close = dialog.getByRole('button', { name: /^(Cancel|Done)$/ }).first();
      await close.scrollIntoViewIfNeeded();
      await expect(close).toBeInViewport();
      if (viewport.width === 375) await page.screenshot({ path: `.tmp/artifacts/T719/${name.replaceAll(' ', '-').replaceAll(':', '')}.png` });
      await close.click();
      await expect(dialog).toHaveCount(0);
    }
    await expect(page.getByRole('button', { name: 'Clear App Data', exact: true })).toHaveText('Clear App Data');
    await page.screenshot({ path: `.tmp/artifacts/T719/settings-${viewport.width}.png` });
  });
}

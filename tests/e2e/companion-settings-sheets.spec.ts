import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

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

async function routeImageDimming(page: Page) {
  await page.route('**/__image-dimming', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionImageDimming.tsx');
    </script></body></html>` }));
}

async function loadImageDimming(page: Page) {
  await page.goto('/__image-dimming');
  await expect(page.getByRole('switch', { name: 'Dim images in dark mode' })).toBeVisible();
  const directory = path.resolve('dist/companion/assets');
  const stylesheet = readdirSync(directory).find(name => /^index-.*\.css$/.test(name));
  if (!stylesheet) throw new Error('Run npm run android:web:build before this test.');
  await page.locator('style').evaluateAll(styles => styles.forEach(style => style.remove()));
  await page.addStyleTag({ content: readFileSync(path.join(directory, stylesheet), 'utf8') });
}

test('matches desktop image dimming across reading surfaces, themes, preview and reload', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await routeImageDimming(page);
  await loadImageDimming(page);
  const images = page.locator('.cm-md-image-element');
  await expect(images).toHaveCount(3);
  const sources = await images.evaluateAll(elements => elements.map(e => (e as HTMLImageElement).src));
  const checkFilter = async (filter: string) => {
    for (const image of await images.all()) await expect(image).toHaveCSS('filter', filter);
    expect(await images.evaluateAll(elements => elements.map(e => (e as HTMLImageElement).src))).toEqual(sources);
  };
  const dimmed = 'brightness(0.86) contrast(0.94) saturate(0.92)';
  await checkFilter(dimmed);
  const toggle = page.getByRole('switch', { name: 'Dim images in dark mode' });
  const box = await toggle.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  const touchInset = await toggle.evaluate(e => parseFloat(getComputedStyle(e, '::before').top));
  expect(box!.height - 2 * touchInset).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: '.tmp/artifacts/T699/dark-enabled.png', fullPage: true });
  await images.first().hover();
  await page.getByRole('button', { name: 'Open image preview', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('img')).toHaveCSS('filter', 'none');
  await expect(dialog.locator('img')).toHaveAttribute('src', sources[0]!);
  await page.keyboard.press('Escape');
  await page.emulateMedia({ colorScheme: 'light' });
  await checkFilter('none');
  await page.emulateMedia({ colorScheme: 'dark' });
  await checkFilter(dimmed);
  await toggle.click();
  await checkFilter('none');
  await loadImageDimming(page);
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await checkFilter('none');
  await toggle.click();
  await checkFilter(dimmed);
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await checkFilter('none');
  await page.screenshot({ path: '.tmp/artifacts/T699/light-enabled.png', fullPage: true });
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await checkFilter(dimmed);
  expect(await page.locator('body').evaluate(e => e.scrollWidth <= innerWidth)).toBe(true);
});

import "./companion-pdf-colors";

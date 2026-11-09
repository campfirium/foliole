import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Locator, type Page } from '@playwright/test';

async function loadBuiltCompanionFixture(page: Page, fixture: string, ready: Locator) {
  await page.route('**/__settings-sheets', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/${fixture}.tsx');
    </script></body></html>` }));
  await page.goto('/__settings-sheets');
  const directory = path.resolve('dist/companion/assets');
  const stylesheet = readdirSync(directory).find(name => /^index-.*\.css$/.test(name));
  if (!stylesheet) throw new Error('Run npm run android:web:build before this test.');
  await expect(ready).toBeVisible();
  await page.locator('style').evaluateAll(styles => styles.forEach(style => style.remove()));
  await page.addStyleTag({ content: readFileSync(path.join(directory, stylesheet), 'utf8') });
}

async function loadSettingsSheets(page: Page) {
  await loadBuiltCompanionFixture(page, 'companionSettingsSheets', page.getByRole('button', { name: 'Days: 30', exact: true }));
}

for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 812 }, { width: 812, height: 375 }]) {
  test(`keeps settings sheets and their actions inside ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await loadSettingsSheets(page);
    await page.getByRole('button', { name: 'Mark ready to clean', exact: true }).click();
    for (const name of ['Days: 30', 'Backup location', 'Clean up', 'Clear App Data', 'Join']) {
      await page.getByRole('button', { name, exact: true }).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      if (name === 'Join') await expect(dialog).toHaveAccessibleName('Join sync group');
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

test.describe('sending feedback from settings', () => {
  test.use({ hasTouch: true });

  for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
    test(`keeps the feedback form usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await loadSettingsSheets(page);
      await page.addStyleTag({ content: 'html { font-size: 125%; }' });
      await page.route('https://feedback.foliole.app/submit', route => route.fulfill({ json: { ok: true } }));
      const entry = page.getByRole('button', { name: 'Send Feedback' });
      await entry.tap();
      const dialog = page.getByRole('dialog', { name: 'Send Feedback' });
      await expect(dialog).toBeInViewport({ ratio: 1 });
      const cancel = dialog.getByRole('button', { name: 'Cancel' });
      const send = dialog.getByRole('button', { name: 'Send' });
      const images = dialog.getByText('Add or paste images');
      await images.scrollIntoViewIfNeeded();
      await expect(cancel).toBeInViewport({ ratio: 1 });
      await expect(send).toBeInViewport({ ratio: 1 });
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await cancel.tap();
      await expect(dialog).toHaveCount(0);
      await entry.tap();
      await dialog.getByRole('textbox', { name: 'Feedback' }).fill('Feedback from mobile settings');
      await send.tap();
      const success = page.getByRole('dialog', { name: 'Feedback sent' });
      await expect(success).toBeInViewport({ ratio: 1 });
      await success.getByRole('button', { name: 'Done' }).tap();
      await expect(success).toHaveCount(0);
    });
  }
});

test.describe('joining a sync group', () => {
  test.use({ hasTouch: true });

  test('centers the join dialog in portrait without individual CSS translation', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loadSettingsSheets(page);
    // Model a WebView that ignores the individual translate property.
    await page.addStyleTag({ content: '[role="dialog"] { translate: none !important; }' });
    await page.getByRole('button', { name: 'Join', exact: true }).tap();
    const dialog = page.getByRole('dialog', { name: 'Join sync group' });
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await dialog.getByRole('button', { name: 'Cancel' }).tap();
    await expect(dialog).toHaveCount(0);
  });

  test('keeps the join dialog and its choices reachable in short landscape', async ({ page }) => {
    await page.setViewportSize({ width: 568, height: 320 });
    await loadSettingsSheets(page);
    await page.getByRole('button', { name: 'Join', exact: true }).tap();
    const dialog = page.getByRole('dialog', { name: 'Join sync group' });
    const more = dialog.getByRole('button', { name: 'Other options' });
    const primary = dialog.getByRole('button', { name: 'Use the sync group’s data to overwrite this device' });
    const cancel = dialog.getByRole('button', { name: 'Cancel' });
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await more.tap();
    await expect(dialog).toBeInViewport({ ratio: 1 });
    await expect(cancel).toBeInViewport({ ratio: 1 });
    const overwrite = dialog.getByRole('button', { name: 'Use this device’s data to overwrite the entire group' });
    await overwrite.scrollIntoViewIfNeeded();
    await expect(overwrite).toBeInViewport({ ratio: 1 });
    await cancel.tap();
    await expect(dialog).toHaveCount(0);
    await page.getByRole('button', { name: 'Join', exact: true }).tap();
    await primary.tap();
    await expect(dialog).toHaveCount(0);
  });
});

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

for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }]) {
  test(`scales settings and reading text at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const appearance = page.getByRole('button', { name: /Appearance/ });
    const load = () => loadBuiltCompanionFixture(page, 'companionTextScale', appearance);
    await load();
    await page.evaluate(() => localStorage.setItem(
      'foliole-companion-reading-typography-settings', JSON.stringify({ fontSize: 20 })
    ));

    const title = appearance.locator('[data-companion-list-title]');
    const icon = appearance.locator('svg').first();
    await expect(title).toHaveCSS('font-size', '16px');
    const iconWidth = await icon.evaluate(el => el.getBoundingClientRect().width);
    await appearance.click();
    const scale = page.getByRole('combobox', { name: 'Text scale' });
    await expect(scale).toHaveValue('100');
    await scale.selectOption('150');
    await expect(scale).toHaveCSS('font-size', '21px');
    await expect(scale).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);

    await load();
    await expect(title).toHaveCSS('font-size', '24px');
    expect(await icon.evaluate(el => el.getBoundingClientRect().width)).toBe(iconWidth);
    await appearance.click();
    await expect(scale).toHaveValue('150');
    await page.getByRole('button', { name: /Back/ }).click();
    await page.getByRole('button', { name: 'Open reading passage' }).click();
    await expect(page.locator('.cm-content')).toHaveCSS('font-size', '30px');
    await expect(page.locator('.cm-md-inline-code')).toHaveCSS('font-size', '20.64px');
  });
}

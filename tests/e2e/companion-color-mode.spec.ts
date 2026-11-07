import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { expect, test, type Page } from '@playwright/test';

async function applyBuiltStyles(page: Page) {
  const directory = path.resolve('dist/companion/assets');
  const stylesheet = readdirSync(directory).find(name => /^index-.*\.css$/.test(name));
  if (!stylesheet) throw new Error('Run npm run android:web:build before this test.');
  await page.locator('style').evaluateAll(styles => styles.forEach(style => style.remove()));
  await page.addStyleTag({ content: readFileSync(path.join(directory, stylesheet), 'utf8') });
}

test('mobile colors follow the system, stay readable, and persist through Appearance settings', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.route('**/__color-mode-test', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionColorMode.tsx');
    </script></body></html>` }));
  await page.goto('/__color-mode-test');
  await applyBuiltStyles(page);
  const root = page.locator('html');
  await expect(page.getByRole('button', { name: 'System', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveAttribute('data-resolved-base-color', 'dark');
  await expect(page.locator('main')).toHaveCSS('background-color', 'rgb(22, 25, 24)');
  const title = page.getByRole('heading', { name: 'Readable topic' });
  const contrast = await title.evaluate(element => {
    const luminance = (css: string) => {
      const channels = css.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(value => {
        const normalized = value / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    };
    const foreground = luminance(getComputedStyle(element).color);
    const background = luminance(getComputedStyle(document.querySelector('main')!).backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  for (const viewport of [{ width: 375, height: 812 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    await page.getByRole('button', { name: 'Reading appearance' }).click();
    const sheet = page.getByRole('dialog', { name: 'Appearance' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('switch', { name: 'Dim images in dark mode' })).toHaveCount(0);
    await expect(sheet.getByRole('radiogroup', { name: 'PDF in dark mode' })).toHaveCount(0);
    await expect(sheet.getByLabel('Accent color picker')).toHaveCount(0);
    expect(await sheet.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    const size = sheet.getByRole('button', { name: 'Increase Size' });
    await size.scrollIntoViewIfNeeded();
    await expect(size).toBeInViewport();
    await sheet.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(sheet).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(root).toHaveAttribute('data-resolved-base-color', 'light');
  await page.reload();
  await expect(root).toHaveAttribute('data-resolved-base-color', 'light');
  await expect(page.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await expect(root).toHaveAttribute('data-resolved-base-color', 'dark');
});

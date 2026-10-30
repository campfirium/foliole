import { expect, test } from '@playwright/test';

test('mobile colors follow the system, stay readable, and share a durable reading override', async ({ page }) => {
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
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  const sheet = page.getByRole('dialog', { name: 'Appearance' });
  await sheet.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(root).toHaveAttribute('data-resolved-base-color', 'light');
  await sheet.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(root).toHaveAttribute('data-resolved-base-color', 'light');
  await expect(page.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'System', exact: true }).click();
  await expect(root).toHaveAttribute('data-resolved-base-color', 'dark');
});

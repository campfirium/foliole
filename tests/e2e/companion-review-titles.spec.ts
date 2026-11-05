import { expect, test } from '@playwright/test';

test('mobile review setting titles share color and typography with the optimization title', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/__review-title-test', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionReviewTitles.tsx');
    </script></body></html>` }));
  await page.goto('/__review-title-test');
  const title = page.getByRole('heading', { name: 'Automatic review optimization' });
  await expect(title).toBeVisible();
  for (const theme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: theme as 'light' | 'dark' });
    await expect(page.locator('html')).toHaveAttribute('data-resolved-base-color', theme);
    const style = await title.evaluate(element => {
      const css = getComputedStyle(element);
      return { color: css.color, 'font-size': css.fontSize, 'font-weight': css.fontWeight, 'line-height': css.lineHeight };
    });
    const labels = page.locator('button > span:first-child');
    expect(await labels.count()).toBeGreaterThan(0);
    for (const label of await labels.all()) {
      for (const [property, value] of Object.entries(style)) await expect(label).toHaveCSS(property, value);
    }
  }
});

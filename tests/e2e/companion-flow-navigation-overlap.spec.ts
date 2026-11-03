import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

for (const availability of ['available', 'unavailable']) {
  test(`Flow exit remains reachable above ${availability} history gestures with a phone safe area`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route('**/__flow-navigation?*', route => route.fulfill({ contentType: 'text/html', body: `
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/@fs/${process.cwd()}/tests/fixtures/companionReadingDisplay.tsx');
      </script></body></html>` }));
    await page.goto(`/__flow-navigation?flow&edge=${availability}`);
    // Model the physical iPhone's status-bar inset without changing its control layout.
    await page.addStyleTag({ content: '.companion-reading-top-chrome { padding-top: 44px !important; }' });
    await page.locator('.cm-line').filter({ hasText: 'Paragraph 1.' }).tap();
    const exit = page.getByTestId('companion-reading-exit');
    await expect(exit).toBeVisible();
    const bounds = await exit.boundingBox();
    if (!bounds) throw new Error('Visible Flow exit has no touch bounds');
    await page.touchscreen.tap(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await expect(page.getByRole('button', { name: 'Return to reading' })).toBeVisible();
    await page.screenshot({ path: `.tmp/artifacts/T707-1/flow-navigation-${availability}.png` });
  });
}

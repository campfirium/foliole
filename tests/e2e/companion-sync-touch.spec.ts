import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

for (const viewport of [{ width: 320, height: 568 }, { width: 375, height: 812 }, { width: 812, height: 375 }]) {
  test(`sync setup actions have independent touch targets at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route('**/__sync-touch', route => route.fulfill({ contentType: 'text/html', body: `
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/@fs/${process.cwd()}/tests/fixtures/companionSyncTouch.tsx');
      </script></body></html>` }));
    await page.goto('/__sync-touch');
    const toggle = page.getByRole('switch', { name: 'Sync', exact: true });
    const searches = page.getByRole('status', { name: 'Search requests' });
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'Connect to Sync Group', exact: true }).tap({ timeout: 3000 });
    await expect(searches).toHaveText('1');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText('Searching...', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Refresh', exact: true }).tap();
    await expect(searches).toHaveText('2');
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(searches).toHaveText('2');
    await toggle.tap();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    const box = await toggle.boundingBox();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y - 5);
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(searches).toHaveText('2');
    await page.screenshot({ path: `.tmp/artifacts/T734/sync-touch-${viewport.width}.png` });
  });
}

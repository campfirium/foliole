import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

for (const width of [320, 375, 428]) {
  for (const flow of [false, true]) {
    test(`reading controls retain separate touch targets at ${width}px, Flow=${flow}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.route('**/__reading-touch?*', route => route.fulfill({
        contentType: 'text/html', body: `
          <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
          <body><div id="root"></div><script type="module">
          import RefreshRuntime from '/@react-refresh';
          RefreshRuntime.injectIntoGlobalHook(window);
          window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
          window.__vite_plugin_react_preamble_installed__ = true;
          await import('/@fs/${process.cwd()}/tests/fixtures/companionReadingDisplay.tsx');
          </script></body></html>`
      }));
      await page.goto(`/__reading-touch?${flow ? 'flow' : 'article'}`);
      await page.locator('.cm-line').filter({ hasText: 'Paragraph 1.' }).tap();
      const exit = page.getByTestId('companion-reading-exit');
      await expect(exit).toBeVisible();
      const controls = page.locator('.companion-reading-top-chrome button');
      const boxes = await controls.evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, height: rect.height };
      }));
      for (const [index, box] of boxes.entries()) {
        expect(box.width).toBeGreaterThanOrEqual(48);
        expect(box.height).toBeGreaterThanOrEqual(48);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.right).toBeLessThanOrEqual(width);
        if (index) expect(box.left).toBeGreaterThanOrEqual(boxes[index - 1]!.right);
      }
      await page.screenshot({ path: `.tmp/artifacts/T705/reading-touch-${width}-${flow}.png` });
      await exit.tap({ position: { x: 2, y: 2 } });
      await expect(page.getByRole('button', { name: 'Return to reading' })).toBeVisible();
    });
  }
}

import { expect, test, type CDPSession } from '@playwright/test';

async function swipe(cdp: CDPSession, from: number, to: number, y: number) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y }] });
  for (let step = 1; step <= 5; step += 1) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove',
      touchPoints: [{ x: from + (to - from) * step / 5, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

for (const inset of [5, 36]) {
  test(`Flow receives inward touch gestures ${inset}px from each edge`, async ({ page, context }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.route('**/__flow-gesture-test', route => route.fulfill({ contentType: 'text/html', body: `
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/@fs/${process.cwd()}/tests/fixtures/companionFlowGestures.tsx');
      </script></body></html>` }));
    await page.goto('/__flow-gesture-test');
    await expect(page.locator('output')).toHaveText('second');
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true });
    await swipe(cdp, inset, inset + 80, 180);
    await expect(page.locator('output')).toHaveText('second');
    await swipe(cdp, 60, 140, 406);
    await expect(page.locator('output')).toHaveText('second');
    await swipe(cdp, inset, inset + 80, 406);
    await expect(page.locator('output')).toHaveText('first');
    await swipe(cdp, 375 - inset, 295 - inset, 406);
    await expect(page.locator('output')).toHaveText('second');
  });
}

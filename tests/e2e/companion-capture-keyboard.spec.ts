import { expect, test, type Page } from '@playwright/test';

async function openCapture(page: Page) {
  await page.addInitScript(() => {
    // Model iOS: keyboard changes the visible region without resizing the layout viewport.
    const viewport = Object.assign(new EventTarget(), { height: 812, offsetTop: 0 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: viewport });
  });
  await page.route('**/__capture-keyboard', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionCaptureKeyboard.tsx');
    </script></body></html>` }));
  await page.goto('/__capture-keyboard');
  await page.getByRole('button', { name: 'Open capture' }).click();
  await expect(page.getByRole('textbox')).toBeFocused();
}

async function setVisibleRegion(page: Page, height: number, offsetTop: number, event = 'resize') {
  await page.evaluate(({ height, offsetTop, event }) => {
    Object.assign(window.visualViewport!, { height, offsetTop });
    window.visualViewport!.dispatchEvent(new Event(event));
  }, { height, offsetTop, event });
}

async function expectCaptureInsideVisibleRegion(page: Page, top: number, height: number) {
  for (const control of [page.getByRole('textbox'), page.getByRole('button', { name: 'Save', exact: true })]) {
    await expect.poll(async () => {
      const bounds = await control.boundingBox();
      return bounds !== null && bounds.height > 0 && bounds.y >= top && bounds.y + bounds.height <= top + height;
    }).toBe(true);
  }
}

test.use({ viewport: { width: 375, height: 812 } });

test('Capture keeps its input and Save visible as the keyboard opens, moves and closes', async ({ page }) => {
  await openCapture(page);
  await expectCaptureInsideVisibleRegion(page, 0, 812);
  const input = page.getByRole('textbox');
  await input.fill('A complete captured topic\nwith a second line.');
  for (const [height, top, event] of [[380, 0, 'resize'], [340, 20, 'scroll'], [812, 0, 'resize']] as const) {
    await setVisibleRegion(page, height, top, event);
    await expectCaptureInsideVisibleRegion(page, top, height);
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('A complete captured topic\nwith a second line.');
  }
  await setVisibleRegion(page, 380, 0);
  await expectCaptureInsideVisibleRegion(page, 0, 380);
  await page.screenshot({ path: '.tmp/artifacts/T673/capture-simulated-keyboard-viewport.png' });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByLabel('Saved text')).toHaveText('A complete captured topic\nwith a second line.');
  await expect(input).not.toBeVisible();
  await page.getByRole('button', { name: 'Open capture' }).click();
  await expect(input).toBeFocused();
  await expectCaptureInsideVisibleRegion(page, 0, 380);
  await expect(input).toHaveValue('');
  await setVisibleRegion(page, 812, 0);
  await expectCaptureInsideVisibleRegion(page, 0, 812);
  await page.screenshot({ path: '.tmp/artifacts/T673/capture-keyboard-dismissed.png' });
});

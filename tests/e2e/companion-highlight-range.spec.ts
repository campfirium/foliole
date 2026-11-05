import { expect, test, type Page, type Route } from '@playwright/test';

test.use({ hasTouch: true, isMobile: true });

async function openReader(page: Page, holdRange = false) {
  await page.setViewportSize({ width: 393, height: 823 });
  await page.route(/\/__highlight-range(?:\?.*)?$/, route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionHighlightRange.tsx');
    </script></body></html>` }));
  await page.goto('/__highlight-range' + (holdRange ? '?hold-range' : ''));
  await expect(page.getByText('Alpha Beta Gamma', { exact: true })).toBeVisible();
}

async function pointInText(page: Page, offset: number) {
  return page.getByText('Alpha Beta Gamma', { exact: true }).evaluate((line, offset) => {
    const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node && offset > node.textContent!.length) { offset -= node.textContent!.length; node = walker.nextNode(); }
    if (!node) throw new Error('text_position_unavailable');
    const range = document.createRange();
    range.setStart(node, offset); range.collapse(true);
    const rect = range.getBoundingClientRect();
    return { x: rect.left, y: rect.top + rect.height / 2 };
  }, offset);
}

test('keeps handles after creating a highlight and adjusts the saved range through the real editor', async ({ page }) => {
  await openReader(page);
  const start = await pointInText(page, 6);
  const end = await pointInText(page, 10);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  const handle = page.getByRole('button', { name: 'Adjust anchor end' });
  await expect(handle).toBeEnabled();
  const bounds = (await handle.boundingBox())!;
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  const target = await pointInText(page, 16);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await expect(handle).toBeVisible();
  await page.mouse.up();
  await expect(page.getByLabel('Saved highlight range')).toHaveText(JSON.stringify({ from: 6, originalText: 'Beta Gamma', to: 16 }));
  await expect(page.locator('.cm-md-highlight').filter({ hasText: 'Beta Gamma' })).toBeVisible();
  await page.getByText('Reading paragraph 1.', { exact: true }).click();
  await expect(handle).toHaveCount(0);
  await page.locator('.cm-md-highlight').click();
  await expect(handle).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Adjust anchor start' })).toBeVisible();
  await expect(page.getByRole('toolbar')).toBeInViewport();
  await expect(page.getByRole('toolbar')).toHaveCSS('user-select', 'none');
  await page.screenshot({ path: '.tmp/artifacts/T723/highlight-range.png' });
});

test('keeps the released range visible when an immediate outside tap dismisses the handles before save completes', async ({ page }) => {
  const request = new Promise<Route>(resolve => { void page.route('**/__range-commit', resolve); });
  await openReader(page, true);
  const start = await pointInText(page, 6);
  const end = await pointInText(page, 10);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  const handle = page.getByRole('button', { name: 'Adjust anchor end' });
  await expect(handle).toBeEnabled();
  const bounds = (await handle.boundingBox())!;
  const target = await pointInText(page, 16);
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 8 });
  await expect(page.locator('.cm-md-highlight')).toHaveText('Beta Gamma');
  const observed = await page.evaluateHandle(() => {
    const ranges: string[] = [];
    const observer = new MutationObserver(() => {
      ranges.push(Array.from(document.querySelectorAll('.cm-md-highlight'), element => element.textContent).join(''));
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return { ranges, observer };
  });
  await page.mouse.up();
  const pending = await request;
  await page.getByText('Reading paragraph 1.', { exact: true }).click();
  await expect(handle).toHaveCount(0);
  await expect(page.locator('.cm-md-highlight')).toHaveText('Beta Gamma');
  await page.screenshot({ path: '.tmp/artifacts/T723/range-held-after-dismiss.png' });
  await pending.fulfill({ status: 200, body: 'saved' });
  await expect(page.getByLabel('Saved highlight range')).toHaveText(JSON.stringify({ from: 6, originalText: 'Beta Gamma', to: 16 }));
  await expect(page.locator('.cm-md-highlight')).toHaveText('Beta Gamma');
  const ranges = await observed.evaluate(result => { result.observer.disconnect(); return result.ranges; });
  expect(ranges.length).toBeGreaterThan(0);
  expect(ranges.every(range => range === 'Beta Gamma')).toBe(true);
});

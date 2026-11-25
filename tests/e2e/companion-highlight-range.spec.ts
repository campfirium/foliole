import { expect, test, type CDPSession, type Page, type Route } from '@playwright/test';

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
  // Sample once per rendered frame; DOM states replaced between frames are never shown.
  const observed = await page.evaluateHandle(() => {
    const result = { ranges: [] as string[], active: true };
    const sample = () => {
      if (!result.active) return;
      result.ranges.push(Array.from(document.querySelectorAll('.cm-md-highlight'), element => element.textContent).join(''));
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    return result;
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
  const ranges = await observed.evaluate(result => { result.active = false; return result.ranges; });
  expect(ranges.length).toBeGreaterThan(0);
  expect(ranges.every(range => range === 'Beta Gamma')).toBe(true);
});

test('scrolls in both directions from an existing highlight and opens its toolbar on tap', async ({ page, context }) => {
  await openReader(page);
  const paragraph = page.getByText('Reading paragraph 12.', { exact: true });
  await paragraph.dblclick({ position: { x: 28, y: 8 } });
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  const highlight = page.locator('.cm-md-highlight');
  const toolbar = page.getByRole('toolbar');
  const surface = page.locator('[data-companion-reading-surface]');
  const cdp = await context.newCDPSession(page);
  for (const distance of [-140, 140]) {
    await highlight.evaluate(element => element.scrollIntoView({ block: 'center' }));
    const bounds = (await highlight.boundingBox())!;
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    const before = await surface.evaluate(element => element.scrollTop);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await expect(toolbar).toBeHidden();
    for (let step = 1; step <= 5; step++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove', touchPoints: [{ x, y: y + distance * step / 5 }]
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => (before - await surface.evaluate(element => element.scrollTop)) * Math.sign(distance))
      .toBeGreaterThan(0);
    // Keep checking through the delayed selection-toolbar opening window.
    await expect(toolbar.waitFor({ state: 'visible', timeout: 500 })).rejects.toThrow(/Timeout 500ms exceeded/);
  }
  await highlight.tap();
  await expect(page.getByRole('button', { name: 'Adjust anchor end' })).toBeVisible();
});

async function takeOverWord(page: Page, cdp: CDPSession, line: string) {
  const paragraph = page.getByText(line, { exact: true });
  const { x, y } = (await paragraph.boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x + 10, y: y + 8 }] });
  // Chromium has no Android ActionMode; provide the OS word selection and release notification.
  await paragraph.evaluate(element => window.getSelection()!.setBaseAndExtent(element.firstChild!, 0, element.firstChild!, 7));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.evaluate(() => document.dispatchEvent(new Event('foliole-android-reading-touch-release')));
  await expect(page.locator('.cm-md-reading-selection')).toHaveText('Reading');
}

async function touchDrag(cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
  for (let i = 1; i <= 14; i++) {
    const x = from.x + (to.x - from.x) * i / 14;
    const y = from.y + (to.y - from.y) * i / 14;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function center(locator: ReturnType<Page['locator']>) {
  const { x, y, width, height } = (await locator.boundingBox())!;
  return { x: x + width / 2, y: y + height / 2 };
}

test('retains the Android reading range during body swipes and highlights the range after dragging again', async ({ page, context }) => {
  await page.addInitScript(() => Object.assign(window, { androidBridge: {} }));
  await openReader(page);
  const cdp = await context.newCDPSession(page);
  const surface = page.locator('[data-companion-reading-surface]');
  const mark = page.locator('.cm-md-reading-selection');
  const end = page.getByRole('button', { name: 'Adjust anchor end' });
  const paragraph = (number: number) => page.getByText(`Reading paragraph ${number}.`, { exact: true });

  await takeOverWord(page, cdp, 'Reading paragraph 1.');
  await paragraph(2).tap();
  await expect(mark).toHaveCount(0);
  await expect(page.getByRole('toolbar')).toBeHidden();
  await expect(surface).toHaveAttribute('data-reading-chrome-visible', 'false');
  await paragraph(2).tap();
  await expect(surface).toHaveAttribute('data-reading-chrome-visible', 'true');
  await paragraph(2).tap();
  await expect(surface).toHaveAttribute('data-reading-chrome-visible', 'false');

  await takeOverWord(page, cdp, 'Reading paragraph 1.');
  await touchDrag(cdp, await center(end), await center(paragraph(10)));
  await expect(mark.last()).toContainText('Reading paragraph');
  const range = await mark.allTextContents();
  const offset = () => surface.evaluate(element => element.scrollTop);
  const before = await offset();
  await touchDrag(cdp, { x: 320, y: 730 }, { x: 320, y: 230 });
  await expect.poll(offset).toBeGreaterThan(before + 350);
  await expect(mark).not.toHaveCount(0);
  expect(await mark.allTextContents()).toEqual(range);
  const scrolled = await offset();
  await touchDrag(cdp, { x: 320, y: 270 }, { x: 320, y: 425 });
  await expect.poll(offset).toBeLessThan(scrolled - 50);
  expect(await mark.allTextContents()).toEqual(range);

  await expect(end).toBeInViewport();
  await touchDrag(cdp, await center(end), await center(paragraph(13)));
  await expect(mark.last()).toContainText('Reading paragraph');
  const final = (await mark.allTextContents()).join('\n\n');
  expect(final).toContain('Reading paragraph 12.');
  expect(final.length).toBeGreaterThan(range.join('\n\n').length);
  await page.getByRole('button', { name: 'Highlight', exact: true }).tap();
  const saved = JSON.parse((await page.getByLabel('Saved highlight range').textContent())!);
  expect(saved.originalText).toBe(final);
  expect(saved.to - saved.from).toBe(final.length);
});

test('keeps Android dialog text out of selection while leaving article text selectable', async ({ page }) => {
  await page.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => {
    document.documentElement.dataset.companionPlatform = 'android';
  }); });
  await openReader(page);
  await page.getByText('Reading paragraph 1.', { exact: true }).tap();
  await page.getByRole('button', { name: 'Outline', exact: true }).tap();
  const dialog = page.getByRole('dialog');
  const title = dialog.getByRole('heading', { name: 'Outline' });
  await title.dblclick();
  expect(await page.evaluate(() => getSelection()?.toString())).toBe('');
  await page.reload();
  await expect(page.getByText('Alpha Beta Gamma', { exact: true })).toBeVisible();
  const start = await pointInText(page, 6);
  const end = await pointInText(page, 10);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Highlight', exact: true }).click();
  await expect(page.getByLabel('Saved highlight range')).toHaveText(JSON.stringify({ from: 6, originalText: 'Beta', to: 10 }));
});

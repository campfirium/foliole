import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true });

async function openReader(page: Page, flow: boolean, answer = false, nextTopic = false, selectionBoundary = false) {
  await page.setViewportSize(nextTopic || selectionBoundary ? page.viewportSize()! : { width: 375, height: 812 });
  await page.route('**/__reading-display?*', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionReadingDisplay.tsx');
    </script></body></html>` }));
  await page.goto(`/__reading-display?${flow ? 'flow' : 'article'}${answer ? '&answer' : ''}${nextTopic ? '&next-topic' : ''}${selectionBoundary ? '&selection-boundary' : ''}`);
  await expect(page.locator('.cm-content').first()).toContainText('Paragraph 1.');
}

for (const viewport of [{ width: 375, height: 812 }, { width: 812, height: 375 }]) {
  test(`keeps reader controls outside text selection at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openReader(page, true, false, false, true);
    const line = await page.locator('.cm-line').first().boundingBox();
    const header = page.getByText('Selection boundary label', { exact: true });
    const footer = page.getByRole('button', { name: 'Resume review' });
    const label = (await header.boundingBox())!;
    await page.mouse.dblclick(label.x + 25, label.y + label.height / 2);
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
    for (const control of [header, footer]) {
      const box = await control.boundingBox();
      await page.mouse.move(line!.x + 50, line!.y + line!.height / 2);
      await page.mouse.down();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, { steps: 16 });
      await page.mouse.up();
      const selected = await page.evaluate(() => {
        const selection = window.getSelection();
        const body = document.querySelector('.cm-content');
        return { text: selection?.toString() ?? '', inside: Boolean(
          selection && body?.contains(selection.anchorNode) && body.contains(selection.focusNode)
        ) };
      });
      expect(selected.text.trim().length).toBeGreaterThan(0);
      expect(selected.text).not.toMatch(/Selection boundary label|Resume/);
      expect(selected.inside).toBe(true);
    }
    await footer.click();
    await expect(page.getByRole('button', { name: 'Return to reading' })).toBeVisible();
  });
}
async function done(page: Page) {
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
}
async function more(page: Page) {
  await expect(page.locator('.cm-content').first()).toBeVisible();
  const button = page.getByRole('button', { name: 'More reading actions' });
  if (!await button.isVisible()) await page.touchscreen.tap(10, 350);
  await button.click();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
}
const top = (page: Page) => page.locator('.cm-line').first().evaluate(element => element.getBoundingClientRect().top);

for (const flow of [false, true]) {
  test(`overlay reclaims space and retains the choice across real reading routes: flow=${flow}`, async ({ page }) => {
    await openReader(page, flow);
    const originalTop = await top(page);
    await more(page);
    await expect(page.getByRole('group', { name: 'Screen display' })).toBeVisible();
    await page.screenshot({ path: `.tmp/artifacts/T701/screen-display-settings-${flow}.png` });
    await page.getByRole('switch', { name: 'Floating reading toolbars' }).click();
    await done(page);
    await expect.poll(() => top(page)).toBeLessThan(originalTop - 20);
    await page.screenshot({ path: `.tmp/artifacts/T701/overlay-${flow}.png` });
    await page.getByRole('button', { name: 'Exit', exact: true }).click();
    await page.getByRole('button', { name: 'Return to reading' }).click();
    await more(page);
    await expect(page.getByRole('switch', { name: 'Floating reading toolbars' })).toBeChecked();
    await done(page);
    await page.touchscreen.tap(10, 350);
    await expect(page.getByRole('button', { name: 'Exit', exact: true })).toBeHidden();
    await page.getByRole('button', { name: 'Switch reading route' }).click();
    await expect.poll(() => top(page)).toBeLessThan(originalTop - 20);
    await page.reload();
    await more(page);
    await expect(page.getByRole('switch', { name: 'Floating reading toolbars' })).toBeChecked();
  });

  test(`overlay keeps the final line reachable in continuous and paged reading: flow=${flow}`, async ({ page }) => {
    await openReader(page, flow);
    await more(page);
    await page.getByRole('switch', { name: 'Floating reading toolbars' }).click();
    await done(page);
    const surface = page.locator('section').filter({ has: page.locator('.cm-content') }).first();
    await expect.poll(() => surface.evaluate(element => {
      element.scrollTop = element.scrollHeight;
      return Math.abs(element.scrollHeight - element.clientHeight - element.scrollTop);
    })).toBeLessThan(1);
    const last = page.locator('.cm-line').last();
    await expect(last).toBeVisible();
    const limit = flow ? await page.getByRole('button', { name: 'Show answer' }).evaluate(element => element.closest('footer')!.getBoundingClientRect().top) : 812;
    await expect.poll(async () => {
      await surface.evaluate(element => { element.scrollTop = element.scrollHeight; });
      return last.evaluate(element => element.getBoundingClientRect().bottom);
    }).toBeLessThanOrEqual(limit);
    await surface.evaluate(element => { element.scrollTop = 0; });
    await more(page);
    await page.getByRole('button', { name: 'Paged scroll', exact: true }).click();
    await done(page);
    for (let i = 0; i < 30; i++) await page.touchscreen.tap(360, 400);
    expect(await last.evaluate(element => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(limit);
  });
}

test('temporarily restores toolbar space for editing without changing the saved preference', async ({ page }) => {
  await openReader(page, false);
  await more(page);
  await page.getByRole('switch', { name: 'Floating reading toolbars' }).click();
  await done(page);
  const readingTop = await top(page);
  await page.getByRole('button', { name: 'Edit content', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  await expect.poll(() => top(page)).toBeGreaterThan(readingTop + 20);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect.poll(() => top(page)).toBe(readingTop);
  await more(page);
  await expect(page.getByRole('switch', { name: 'Floating reading toolbars' })).toBeChecked();
});


test('revealed Flow answers gain the toolbar area and can scroll clear of the answer bar', async ({ page }) => {
  await openReader(page, true, true);
  const grid = page.locator('.companion-item-review-layout');
  const before = await grid.evaluate(element => element.getBoundingClientRect().height);
  await more(page);
  await page.getByRole('switch', { name: 'Floating reading toolbars' }).click();
  await done(page);
  await expect.poll(() => grid.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(before + 20);
  const surface = page.locator('section.companion-review-surface');
  const answer = page.getByText('Answer text at the bottom.', { exact: true });
  const footerTop = await page.getByRole('button', { name: 'Show answer' })
    .evaluate(element => element.closest('footer')!.getBoundingClientRect().top);
  await expect.poll(async () => {
    await surface.evaluate(element => { element.scrollTop = element.scrollHeight; });
    return answer.evaluate(element => element.getBoundingClientRect().bottom);
  }).toBeLessThanOrEqual(footerTop);
});

for (const viewport of [{ width: 375, height: 812 }, { width: 640, height: 360 }]) {
  test(`reaches the next topic after the Flow body at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openReader(page, true, false, true);
    const next = page.getByRole('button', { name: 'Next topic' });
    await expect(next).not.toBeInViewport();
    const surface = page.locator('[data-companion-reading-surface]');
    await expect.poll(async () => {
      await surface.evaluate(element => { element.scrollTop = element.scrollHeight; });
      const box = await next.boundingBox();
      return Boolean(box && box.y >= 0 && box.y + box.height < viewport.height);
    }).toBe(true);
    await next.tap();
    await expect(page.locator('.cm-content')).toContainText('Chapter two begins here.');
  });
}

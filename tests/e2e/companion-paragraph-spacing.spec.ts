import { expect, test, type Page } from '@playwright/test';

async function openReader(page: Page) {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.route('**/__paragraph-spacing', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionParagraphSpacing.tsx');
    </script></body></html>` }));
  await page.goto('/__paragraph-spacing');
  await expect(page.locator('.cm-content')).toContainText('Paragraph 1.');
  await expect.poll(() => page.evaluate(() => Boolean(window.paragraphSpacingEditor))).toBe(true);
}

async function paragraphGap(page: Page) {
  return page.locator('.cm-line').first().evaluate(element => parseFloat(getComputedStyle(element).paddingBottom));
}

test('paragraph spacing changes real layout and survives topic reentry and page reload', async ({ page }) => {
  await openReader(page);
  const defaultGap = await paragraphGap(page);
  expect(defaultGap).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  for (let index = 0; index < 5; index += 1) {
    await page.getByRole('button', { name: 'Increase Paragraph spacing' }).click();
  }
  await expect(page.getByLabel('Paragraph spacing', { exact: true })).toHaveText('0.6em');
  await page.screenshot({ path: '.tmp/artifacts/T689/appearance.png' });
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect.poll(() => paragraphGap(page)).toBeGreaterThan(defaultGap);
  const gap = await paragraphGap(page);
  await page.getByRole('button', { name: 'Leave topic' }).click();
  await page.getByRole('button', { name: 'Return to topic' }).click();
  await expect.poll(() => paragraphGap(page)).toBe(gap);
  await page.reload();
  await expect.poll(() => paragraphGap(page)).toBe(gap);
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await expect(page.getByLabel('Paragraph spacing', { exact: true })).toHaveText('0.6em');
});

test('reflows the same long document without changing its selection, highlight or reading position', async ({ page }) => {
  await openReader(page);
  const initial = await page.evaluate(() => {
    const editor = window.paragraphSpacingEditor!;
    const content = editor.getContent();
    const from = content.indexOf('Paragraph 25.');
    editor.setSelection({ from, to: from + 'Paragraph 25.'.length });
    editor.revealSelection({ from, to: from + 'Paragraph 25.'.length });
    return { content, selection: editor.getSelection() };
  });
  await expect.poll(() => page.locator('main').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const scrollTop = await page.locator('main').evaluate(element => element.scrollTop);
  await page.getByRole('button', { name: 'Reading appearance' }).click();
  await page.getByRole('button', { name: 'Increase Paragraph spacing' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  const final = await page.evaluate(() => ({ content: window.paragraphSpacingEditor!.getContent(),
    selection: window.paragraphSpacingEditor!.getSelection() }));
  expect(final).toEqual(initial);
  await expect.poll(() => page.locator('main').evaluate(element => element.scrollTop)).toBe(scrollTop);
  await page.locator('main').evaluate(element => { element.scrollTop = 0; });
  await expect(page.locator('.cm-md-highlight')).toHaveText('highlighted passage');
  await page.screenshot({ path: '.tmp/artifacts/T689/reading.png' });
});

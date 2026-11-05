import { expect, test, type Page } from '@playwright/test';

async function appearance(page: Page) {
  const actions = page.getByRole('button', { name: 'More reading actions' });
  if (!await actions.isVisible()) await page.locator('.cm-line').first().click({ position: { x: 5, y: 5 } });
  await actions.click();
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
}

async function measure(page: Page) {
  return page.locator('.cm-content').evaluate(element => {
    const rect = element.getBoundingClientRect();
    const parent = element.parentElement!.getBoundingClientRect();
    return { ratio: rect.width / parent.width, center: rect.x + rect.width / 2 - parent.x - parent.width / 2 };
  });
}

for (const width of [375, 812, 1024]) {
  test(`retains precise text width and highlights at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 812 });
    await page.route('**/__reading-width', route => route.fulfill({ contentType: 'text/html', body: `
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/@fs/${process.cwd()}/tests/fixtures/companionReadingWidth.tsx');
      </script></body></html>` }));
    await page.goto('/__reading-width');
    const highlight = page.locator('.cm-md-highlight').first();
    await expect(highlight).toHaveText('highlighted passage');
    const originalText = await page.locator('.cm-content').textContent();
    expect((await measure(page)).ratio).toBeCloseTo(1, 2);
    await appearance(page);
    const decrease = page.getByRole('button', { name: 'Decrease Text width' });
    for (let i = 0; i < 17; i++) await decrease.click();
    await expect(page.getByLabel('Text width', { exact: true })).toHaveText('83%');
    await page.screenshot({ path: `.tmp/artifacts/T698/controls-${width}.png` });
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => (await measure(page)).ratio).toBeCloseTo(0.83, 2);
    expect(Math.abs((await measure(page)).center)).toBeLessThan(1);
    await expect(highlight).toHaveText('highlighted passage');
    expect(await page.locator('.cm-content').textContent()).toBe(originalText);
    await highlight.evaluate(element => {
      const range = document.createRange();
      range.selectNodeContents(element);
      window.getSelection()!.removeAllRanges();
      window.getSelection()!.addRange(range);
    });
    expect(await page.evaluate(() => window.getSelection()!.toString())).toBe('highlighted passage');
    await page.setViewportSize({ width: width === 375 ? 812 : 375, height: 812 });
    await expect.poll(async () => (await measure(page)).ratio).toBeCloseTo(0.83, 2);
    await expect(highlight).toHaveText('highlighted passage');
    expect(await page.evaluate(() => window.getSelection()!.toString())).toBe('highlighted passage');
    await page.screenshot({ path: `.tmp/artifacts/T698/reading-${width}.png` });
    await appearance(page);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Exit', exact: true }).click();
    await page.getByRole('button', { name: 'Return to reading' }).click();
    await expect.poll(async () => (await measure(page)).ratio).toBeCloseTo(0.83, 2);
    await page.reload();
    await expect.poll(async () => (await measure(page)).ratio).toBeCloseTo(0.83, 2);
    await appearance(page);
    await expect(page.getByLabel('Text width', { exact: true })).toHaveText('83%');
  });
}

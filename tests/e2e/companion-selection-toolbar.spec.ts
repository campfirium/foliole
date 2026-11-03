import { expect, test, type Locator, type Page } from '@playwright/test';

async function openReader(page: Page, theme: string) {
  await page.route('**/__selection-toolbar', route => route.fulfill({ contentType: 'text/html', body: `
    <html data-resolved-base-color="${theme}"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionSelectionToolbar.tsx');
    </script></body></html>` }));
  await page.goto('/__selection-toolbar');
  await page.getByText('Select this passage and keep the remaining text readable.', { exact: true })
    .dblclick({ position: { x: 20, y: 10 } });
  await expect(page.getByRole('toolbar')).toBeVisible();
}

async function expectFlatSurface(surface: Locator) {
  await expect(surface).toBeVisible();
  const style = await surface.evaluate(element => {
    const value = getComputedStyle(element);
    return { shadow: value.boxShadow, background: value.backgroundColor, border: value.borderTopWidth };
  });
  expect(style.shadow).toBe('none');
  expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.border).toBe('1px');
}

test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });

for (const theme of ['light', 'dark']) {
  test(`selection surfaces stay readable without blurred shadows in ${theme} mode`, async ({ page }) => {
    await openReader(page, theme);
    await expectFlatSurface(page.getByRole('toolbar'));
    await page.getByRole('button', { name: 'More', exact: true }).click();
    await expectFlatSurface(page.getByRole('menu'));
    await page.getByRole('button', { name: 'Add Comment', exact: true }).click();
    await expect(page.getByRole('menu')).toBeHidden();
    const note = page.getByPlaceholder('Add annotation...');
    await expectFlatSurface(note.locator('..'));
    await note.fill('A reader note');
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.screenshot({ path: `.tmp/artifacts/T703/toolbar-${theme}-after.png` });
    await page.getByRole('button', { name: 'Highlight', exact: true }).click();
    await expect(page.getByLabel('Saved annotation')).toHaveText('Select');
    await expect(page.getByRole('toolbar')).toBeHidden();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBe('');
    await page.getByText('Select this passage and keep the remaining text readable.', { exact: true })
      .dblclick({ position: { x: 20, y: 10 } });
    await expect(page.getByRole('toolbar')).toBeVisible();
    await page.getByRole('button', { name: 'Add Comment', exact: true }).click();
    await expect(note).toHaveValue('');
    await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
    await expect(page.getByRole('toolbar')).toBeHidden();
  });
}

import { expect, test, type Page } from '@playwright/test';

async function openOutline(page: Page, scenario: string) {
  await page.route('**/__outline?*', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionOutlineNavigation.tsx');
    </script></body></html>` }));
  await page.goto(`/__outline?scenario=${scenario}`);
  await page.locator('.cm-content').click({ position: { x: 100, y: 20 } });
  await page.getByRole('button', { name: 'Outline', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Outline' })).toBeVisible();
}

for (const width of [320, 375]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`outline navigation at ${width}px in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.emulateMedia({ colorScheme });
      await openOutline(page, 'headings');
      await expect(page.getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'true');
      for (const tab of await page.getByRole('tab').all()) {
        const bounds = await tab.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
      }
      await page.getByRole('tab', { name: 'Item' }).click();
      await page.screenshot({ animations: 'disabled', path: `.tmp/artifacts/T721/outline-${width}-${colorScheme}.png` });
      const row = page.getByRole('tabpanel').getByRole('button', { name: 'Item passage in the original text.' });
      await row.click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('document', { name: 'Topic body' })).toBeVisible();
      const paragraph = page.locator('.cm-line').filter({ hasText: 'Item passage in the original text.' });
      await expect(paragraph).toBeInViewport();
      await page.getByRole('button', { name: 'Outline', exact: true }).click();
      await expect(page.getByRole('tab', { name: 'Outline' })).toHaveAttribute('aria-selected', 'true');
      expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    });
  }
}

test('opens the first nonempty page and retains all three tabs for an empty text', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const [scenario, selected] of [['topics', 'Topic'], ['items', 'Item'], ['empty', 'Outline']]) {
    await openOutline(page, scenario!);
    await expect(page.getByRole('tab', { name: selected, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab')).toHaveCount(3);
    if (scenario === 'empty') await expect(page.getByText('No headings in this topic')).toBeVisible();
  }
});

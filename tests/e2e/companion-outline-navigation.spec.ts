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
    test(`integrated Outline at ${width}px in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.emulateMedia({ colorScheme });
      await openOutline(page, 'headings');
      expect(await page.getByRole('dialog', { name: 'Outline' }).boundingBox())
        .toMatchObject({ x: 0, y: 0, width, height: 812 });
      await expect(page.getByRole('tab')).toHaveCount(0);
      const heading = page.getByRole('button', { name: 'Source heading', exact: true });
      const toggle = page.getByRole('button', { name: 'Toggle content for Source heading (2)' });
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await toggle.click();
      await expect(page.getByRole('button', { name: 'Topic passage in the original text.' })).toHaveCount(0);
      await expect(heading).toBeVisible();
      await toggle.click();
      await page.screenshot({ animations: 'disabled', path: `.tmp/artifacts/T721-1/outline-${width}-${colorScheme}.png` });
      await page.getByRole('button', { name: 'Topic passage in the original text.' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.locator('.cm-line').filter({ hasText: 'Topic passage in the original text.' })).toBeInViewport();
      await page.getByRole('button', { name: 'Outline', exact: true }).click();
      expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.getByRole('button', { name: 'Item passage in the original text.' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('document', { name: 'Question' })).toContainText('Question from the original text.');
      await page.getByRole('document', { name: 'Question' }).click();
      await page.getByRole('button', { name: 'More reading actions' }).click();
      await expect(page.getByRole('button', { name: 'Highlight', exact: true })).toHaveCount(0);
      await page.getByRole('button', { name: 'Outline', exact: true }).click();
      await expect(page.getByText('No headings or related topics and items', { exact: true })).toBeVisible();
    });
  }
}

test('lists related cards without a synthetic heading and handles truly empty content', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const scenario of ['topics', 'items', 'empty']) {
    await openOutline(page, scenario);
    await expect(page.getByRole('tab')).toHaveCount(0);
    if (scenario === 'empty') await expect(page.getByText('No headings or related topics and items', { exact: true })).toBeVisible();
    else await expect(page.getByRole('button', { name: 'Item passage in the original text.' })).toBeVisible();
  }
});

test('returns from fullscreen Outline to the same reader and restores its opener focus', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openOutline(page, 'headings');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const opener = page.getByRole('button', { name: 'Outline', exact: true });
  await expect(opener).toBeFocused();
  await opener.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('document', { name: 'Topic body' })).toBeVisible();
});

import { readFile, readdir } from 'node:fs/promises';

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

test('keeps Outline on screen with the bundled companion styles', async ({ page }) => {
  const assets = `${process.cwd()}/dist/companion/assets`;
  const files = (await readdir(assets)).filter(file => file.endsWith('.css'));
  expect(files.length).toBeGreaterThan(0);
  const css = (await Promise.all(files.map(file => readFile(`${assets}/${file}`, 'utf8')))).join('\n');
  await page.setViewportSize({ width: 393, height: 823 });
  await openOutline(page, 'headings');
  await page.evaluate(() => document.querySelectorAll('style, link[rel="stylesheet"]').forEach(node => node.remove()));
  await page.addStyleTag({ content: css });
  const dialog = page.getByRole('dialog', { name: 'Outline' });
  expect(await dialog.boundingBox()).toMatchObject({ x: 0, y: 0, width: 393, height: 823 });
  await page.getByRole('button', { name: 'Toggle content for Source heading (2)' }).click();
  await expect(page.getByRole('button', { name: 'Source heading', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

for (const width of [320, 375]) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`integrated Outline at ${width}px in ${colorScheme}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.emulateMedia({ colorScheme });
      await openOutline(page, 'headings');
      expect(await page.getByRole('dialog', { name: 'Outline' }).boundingBox())
        .toMatchObject({ x: 0, y: 0, width, height: 812 });
      await expect(page.getByRole('tab')).toHaveCount(0);
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Outline acceptance article', exact: true })).toHaveCount(0);
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


test('continues through ten derived generations and opens the deep Item as a card', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 360 });
  await openOutline(page, 'deep');
  await expect(page.getByRole('button', { name: 'Derived detail 1', exact: true })).toHaveCount(0);
  let title = 'Topic passage in the original text.';
  for (let depth = 1; depth <= 10; depth++) {
    await page.getByRole('button', { name: `Toggle content for ${title} (1)`, exact: true }).click();
    title = `Derived detail ${depth}`;
    await expect(page.getByRole('button', { name: title, exact: true })).toBeVisible();
  }
  expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: '.tmp/artifacts/T721-1/deep-320.png' });
  await page.getByRole('button', { name: 'Derived detail 10', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('document', { name: 'Question' })).toContainText('Body at depth 10.');
});

test('automatically expands every descendant that fits one screen and respects subsequent manual collapse', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openOutline(page, 'compact');
  for (let depth = 1; depth <= 3; depth++) {
    await expect(page.getByRole('button', { name: `Derived detail ${depth}`, exact: true })).toBeInViewport();
  }
  const scroller = page.getByRole('dialog').locator('.app-scrollbar');
  expect(await scroller.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  await expect(page.getByRole('dialog').locator('.lucide-map-pin, .lucide-arrow-up-right')).toHaveCount(0);
  const toggle = page.getByRole('button', { name: 'Toggle content for Topic passage in the original text. (1)', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await toggle.click();
  await page.setViewportSize({ width: 375, height: 900 });
  await expect(page.getByRole('button', { name: 'Derived detail 1', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Source heading', exact: true })).toBeVisible();
});

test('keeps deeper content collapsed when the viewport or wrapped text cannot fit the whole tree', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 220 });
  await openOutline(page, 'compact');
  await expect(page.getByRole('button', { name: 'Derived detail 1', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Source heading', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 812 });
  await expect(page.getByRole('button', { name: 'Derived detail 3', exact: true })).toBeVisible();
  await openOutline(page, 'wrapped');
  const toggle = page.getByRole('button', { name: 'Toggle content for Topic passage in the original text. (1)', exact: true });
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Long descendant title '.repeat(80).trim(), exact: true })).toBeVisible();
});

test('keeps all six heading levels and wraps long unlocated card titles on a narrow screen', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await openOutline(page, 'long');
  for (let level = 1; level <= 6; level++) await expect(page.getByRole('button', { name: `Heading ${level}`, exact: true })).toBeVisible();
  const scroller = page.getByRole('dialog').locator('.app-scrollbar');
  await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(page.getByRole('button', { name: 'LongTitle'.repeat(40), exact: true })).toBeVisible();
  expect(await scroller.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.screenshot({ animations: 'disabled', path: '.tmp/artifacts/T721-1/long-title-320.png' });
});

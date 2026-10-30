import { expect, test, type Page } from '@playwright/test';

async function openReader(page: Page, length: string, mode = 'continuous') {
  await page.addInitScript(value => window.localStorage.setItem('foliole-companion-reading-mode', value), mode);
  await page.route('**/__next-topic-layout?*', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionNextTopicLayout.tsx');
    </script></body></html>` }));
  await page.goto(`/__next-topic-layout?length=${length}`);
  await expect(page.getByRole('button', { name: 'Next topic' })).toBeVisible();
  await expect(page.locator('.cm-content')).toBeVisible();
  if (length !== 'empty') await expect(page.locator('.cm-content')).toContainText(length === 'long' ? 'Paragraph 1.' : 'A short topic.');
}

for (const viewport of [{ width: 375, height: 812 }, { width: 360, height: 640 }]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });
    for (const { length, mode } of ['short', 'empty'].flatMap(length =>
      ['continuous', 'paged'].map(mode => ({ length, mode })))) {
      test(`${mode} ${length} topics show the next action at the bottom without scrolling`, async ({ page }) => {
        await openReader(page, length, mode);
        const button = page.getByRole('button', { name: 'Next topic' });
        await expect(button).toBeInViewport({ ratio: 1 });
        const bounds = await button.boundingBox();
        expect(bounds!.y).toBeGreaterThan(viewport.height / 2);
        const scroll = await button.evaluate(element => {
          const surface = element.closest('section')!;
          const safeBottom = surface.getBoundingClientRect().bottom - parseFloat(getComputedStyle(surface).paddingBottom);
          return { top: surface.scrollTop, extra: surface.scrollHeight - surface.clientHeight,
            clearOfControls: element.getBoundingClientRect().bottom <= safeBottom };
        });
        expect(scroll.top).toBe(0);
        expect(scroll.extra).toBeLessThanOrEqual(1);
        expect(scroll.clearOfControls).toBe(true);
        await page.screenshot({ path: `.tmp/artifacts/T657/${length}-${mode}-${viewport.width}.png` });
        await button.click();
        await expect(page.getByText('The next topic.', { exact: true })).toBeVisible();
      });
    }

    test('long topics keep the next action after the body and reveal it at the end', async ({ page }) => {
      await openReader(page, 'long');
      const button = page.getByRole('button', { name: 'Next topic' });
      await expect(button).not.toBeInViewport();
      // The editor refines offscreen line heights as the document scrolls.
      await expect(async () => {
        await button.scrollIntoViewIfNeeded();
        await expect(button).toBeInViewport({ ratio: 1, timeout: 250 });
      }).toPass({ timeout: 5000 });
      await page.screenshot({ path: `.tmp/artifacts/T657/long-${viewport.width}.png` });
      await expect(button).toBeInViewport({ ratio: 1 });
      const body = await page.locator('.cm-content').boundingBox();
      const footer = await button.boundingBox();
      expect(footer!.y).toBeGreaterThanOrEqual(body!.y + body!.height);
      await button.click();
      await expect(page.getByText('The next topic.', { exact: true })).toBeVisible();
    });
  });
}

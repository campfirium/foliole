import { expect, test, type Page } from '@playwright/test';

async function openFooter(page: Page, query = '') {
  await page.route('**/__review-footer?*', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionReviewFooter.tsx');
    </script></body></html>` }));
  await page.goto(`/__review-footer?${query}`);
  await expect(page.locator('footer')).toBeVisible();
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [320, 375, 430]) {
    test(`${theme} ${width}px keeps the reading surface continuous and grades easy to tap`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.emulateMedia({ colorScheme: theme });
      await openFooter(page);
      const footer = page.locator('footer');
      await expect(footer).toHaveCSS('background-color', await page.locator('main').evaluate(el => getComputedStyle(el).backgroundColor));
      const referenceFont = await page.getByRole('button', { name: 'Desktop reference' }).evaluate(el => getComputedStyle(el).fontSize);
      const buttons = footer.getByRole('button');
      const widths: number[] = [];
      for (const button of await buttons.all()) {
        await expect(button).toBeInViewport({ ratio: 1 });
        await expect(button).toHaveCSS('font-size', referenceFont);
        const box = (await button.boundingBox())!;
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.width).toBeGreaterThanOrEqual(44);
        widths.push(box.width);
      }
      expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(1);
      const gaps = await buttons.evaluateAll(elements => elements.slice(1).map((el, index) =>
        el.getBoundingClientRect().left - elements[index]!.getBoundingClientRect().right));
      expect(Math.min(...gaps)).toBeGreaterThanOrEqual(8);
      const first = (await buttons.nth(0).boundingBox())!;
      const last = (await buttons.nth(3).boundingBox())!;
      expect(first.x).toBeLessThanOrEqual(24);
      expect(width - last.x - last.width).toBeLessThanOrEqual(24);
      await expect(footer.getByText('Review status')).toBeVisible();
      await page.screenshot({ path: `.tmp/artifacts/T660/footer-${theme}-${width}.png` });
      for (const [label, result] of [['Again', '1'], ['Hard', '2'], ['Good', '3'], ['Easy', '4']]) {
        await page.getByRole('button', { name: label, exact: true }).click();
        await expect(page.getByLabel('Review result')).toHaveText(`Grade ${result}`);
      }
    });
  }
}

test('reveal, reading actions, and disabled grades retain their behavior', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openFooter(page, 'reveal=false');
  const reveal = page.getByRole('button', { name: 'Show Answer', exact: true });
  expect((await reveal.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await reveal.click();
  await expect(page.getByRole('button', { name: 'Good', exact: true })).toBeVisible();
  for (const soon of [false, true]) {
    await page.goto(`/__review-footer?kind=reading&soon=${soon}`);
    const gaps = await page.locator('footer').getByRole('button').evaluateAll(elements =>
      elements.slice(1).map(el => parseFloat(getComputedStyle(el).marginLeft)));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(8);
    for (const label of [...(soon ? ['Soon'] : []), 'Later', 'Read', 'Dismiss']) {
      const button = page.locator('footer').getByRole('button', { name: label, exact: true });
      await expect(button).toBeInViewport({ ratio: 1 });
      expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await button.click();
      await expect(page.getByLabel('Review result')).toHaveText(label);
    }
  }
  await page.goto('/__review-footer?disabled=true');
  for (const button of await page.locator('footer').getByRole('button').all()) await expect(button).toBeDisabled();
});

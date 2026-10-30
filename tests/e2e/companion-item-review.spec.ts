import { expect, test, type Page } from '@playwright/test';

async function openReview(page: Page, query = '') {
  await page.route('**/__item-review?*', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionItemReview.tsx');
    </script></body></html>` }));
  await page.goto(`/__item-review?${query}`);
  await expect(page.getByRole('document', { name: 'Question', exact: true })).toBeVisible();
}

async function layout(page: Page) {
  return page.locator('.companion-review-surface').evaluate(surface => {
    const top = surface.querySelector('.companion-review-header')!.getBoundingClientRect().bottom;
    const footer = surface.querySelector('footer')!.getBoundingClientRect();
    const answer = surface.querySelector('.companion-item-answer')!.getBoundingClientRect();
    const lastAnswerBlock = surface.querySelector('.companion-item-answer .cm-content')!.lastElementChild!;
    return { ratio: (answer.top - top) / (footer.top - top), answerContentBottom: lastAnswerBlock.getBoundingClientRect().bottom,
      footerTop: footer.top, scrollHeight: surface.scrollHeight, height: surface.clientHeight };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} review divides only the space above the real grading buttons`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: theme });
    await openReview(page, 'hidden');
    await page.getByRole('button', { name: 'Show Answer', exact: true }).click();
    await expect.poll(async () => (await layout(page)).ratio).toBeCloseTo(0.55, 2);
    const before = await layout(page);
    expect(before.answerContentBottom).toBeLessThanOrEqual(before.footerTop + 1);
    await page.screenshot({ path: `.tmp/artifacts/T672/review-${theme}.png` });
    await page.setViewportSize({ width: 430, height: 700 });
    await expect.poll(async () => (await layout(page)).ratio).toBeCloseTo(0.55, 2);
    await page.getByRole('button', { name: 'Good', exact: true }).click();
    await expect(page.getByLabel('Submitted grade')).toHaveText('3');
  });
}

test('long review content retains outer page scrolling and accessible grade buttons', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const query of ['question=long', 'answer=long', 'question=long&answer=long']) {
    await openReview(page, query);
    await expect.poll(async () => { const m = await layout(page); return m.scrollHeight > m.height; }).toBe(true);
    await expect(page.getByRole('button', { name: 'Good', exact: true })).toBeInViewport();
    await page.screenshot({ path: `.tmp/artifacts/T672/review-${query.replaceAll(/[=&]/g, '-')}.png` });
  }
});

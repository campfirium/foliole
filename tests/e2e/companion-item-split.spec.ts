import { expect, test, type Page } from '@playwright/test';

async function openItem(page: Page, query = '') {
  await page.route('**/__item-split?*', route => route.fulfill({ contentType: 'text/html', body: `
    <html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type;
    window.__vite_plugin_react_preamble_installed__ = true;
    await import('/@fs/${process.cwd()}/tests/fixtures/companionItemSplit.tsx');
    </script></body></html>` }));
  await page.goto(`/__item-split?${query}`);
  await page.locator('.companion-review-surface').click({ position: { x: 180, y: 260 } });
  await page.getByTestId('companion-reading-edit').click();
  await expect(page.getByRole('textbox', { name: 'Answer', exact: true })).toBeEditable();
}

async function metrics(page: Page) {
  return page.locator('.companion-item-edit-layout').evaluate(root => {
    const question = root.querySelector<HTMLElement>('.companion-item-edit-question')!;
    const answer = root.querySelector<HTMLElement>('.companion-item-edit-answer')!;
    const q = question.getBoundingClientRect().height;
    const a = answer.getBoundingClientRect().height;
    const overflow = (pane: HTMLElement) => {
      const scroller = pane.querySelector<HTMLElement>('.cm-scroller')!;
      return scroller.scrollHeight - scroller.clientHeight;
    };
    return { ratio: q / (q + a), questionOverflow: overflow(question), answerOverflow: overflow(answer),
      bottom: root.getBoundingClientRect().bottom, height: root.getBoundingClientRect().height };
  });
}

for (const theme of ['light', 'dark'] as const) {
  test(`${theme} short item uses the lower divider and adapts to a keyboard-sized viewport`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ colorScheme: theme });
    await openItem(page);
    await expect.poll(async () => (await metrics(page)).ratio).toBeCloseTo(0.618, 2);
    await page.screenshot({ path: `.tmp/artifacts/T672/mobile-${theme}-short.png` });
    const answer = page.getByRole('textbox', { name: 'Answer', exact: true });
    await answer.focus();
    await page.setViewportSize({ width: 375, height: 420 });
    await expect(answer).toBeFocused();
    await expect.poll(async () => (await metrics(page)).bottom).toBeLessThanOrEqual(420);
    await expect.poll(async () => (await metrics(page)).ratio).toBeCloseTo(0.618, 2);
    await expect(answer).toContainText('Short answer.');
    await page.screenshot({ path: `.tmp/artifacts/T672/mobile-${theme}-keyboard.png` });
  });
}

test('long content keeps spare-space borrowing and independent scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  for (const query of ['answer=long', 'question=long', 'question=long&answer=long']) {
    await openItem(page, query);
    const both = query.includes('&');
    await expect.poll(async () => {
      const m = await metrics(page);
      return both ? m.questionOverflow > 100 && m.answerOverflow > 100
        : query.startsWith('answer') ? m.questionOverflow <= 2 && m.ratio < 0.5 : m.answerOverflow <= 2 && m.ratio > 0.5;
    }).toBe(true);
    await page.screenshot({ path: `.tmp/artifacts/T672/mobile-${query.replaceAll(/[=&]/g, '-')}.png` });
  }
});

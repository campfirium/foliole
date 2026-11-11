import { readFile, readdir } from 'node:fs/promises';

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
  await expect(page.getByRole('document', { name: new URLSearchParams(query).has('reading') ? 'Topic body' : 'Question', exact: true })).toBeVisible();
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

test('PDF text resume puts the restored passage at the start of the outer reading viewport', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openReview(page, 'reading&question=long&pdfResume');
  const target = page.getByText('Paragraph 25. Content continues.', { exact: true });
  await expect.poll(() => target.evaluate(line => {
    const surface = line.closest('[data-companion-reading-surface]')!;
    const viewport = surface.getBoundingClientRect();
    return (line.getBoundingClientRect().top - viewport.top) / viewport.height;
  })).toBeLessThanOrEqual(0.12);
  await expect(target).toBeInViewport();
});

test('revealed item editing scrolls each field independently inside its allocated space', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openReview(page, 'editing&question=long&answer=long');
  await page.getByRole('button', { name: 'Edit item', exact: true }).click();
  for (const name of ['Question', 'Answer']) {
    await expect(page.getByRole('textbox', { name, exact: true })).toBeVisible();
  }
  const fields = page.locator('.companion-item-edit-layout .cm-scroller');
  for (const field of await fields.all()) {
    await expect.poll(() => field.evaluate(element => ({
      scrollable: ['auto', 'scroll'].includes(getComputedStyle(element).overflowY),
      overflowing: element.scrollHeight > element.clientHeight
    }))).toEqual({ scrollable: true, overflowing: true });
    await field.evaluate(element => { element.scrollTop = 0; });
  }
  await fields.nth(0).evaluate(element => { element.scrollTop = 50; });
  await expect.poll(() => fields.nth(0).evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await fields.nth(1).evaluate(element => element.scrollTop)).toBe(0);
  await fields.nth(1).evaluate(element => { element.scrollTop = 80; });
  await expect.poll(() => fields.nth(1).evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: '.tmp/artifacts/T680/item-editor-independent-scroll.png' });
});

test('wide item images fit the reading width before and after reveal', async ({ page }) => {
  const assets = 'dist/companion/assets';
  const stylesheets = (await readdir(assets)).filter(file => file.endsWith('.css'));
  expect(stylesheets.length).toBeGreaterThan(0);
  const css = (await Promise.all(stylesheets.map(file => readFile(`${assets}/${file}`, 'utf8')))).join('\n');

  await page.setViewportSize({ width: 320, height: 700 });
  await openReview(page, 'hidden&question=image&answer=image');
  await page.evaluate(() => document.querySelectorAll('style[data-vite-dev-id]').forEach(node => node.remove()));
  await page.addStyleTag({ content: css });

  const expectImageToFit = async (name: string) => {
    const image = page.getByRole('img', { name, exact: true });
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => {
      const box = element.getBoundingClientRect();
      const surface = element.closest('.companion-review-surface')!;
      const surfaceBox = surface.getBoundingClientRect();
      const style = getComputedStyle(element);
      const width = box.width - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
      const height = box.height - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth);
      return {
        withinViewport: box.left >= surfaceBox.left && box.right <= surfaceBox.right,
        pageFits: surface.scrollWidth <= surface.clientWidth &&
          document.documentElement.scrollWidth <= window.innerWidth,
        proportional: element.naturalWidth > 0 && Math.abs(width / height - element.naturalWidth / element.naturalHeight) < 0.02
      };
    })).toEqual({ withinViewport: true, pageFits: true, proportional: true });
  };

  await expectImageToFit('Question illustration');
  const question = page.getByRole('img', { name: 'Question illustration', exact: true });
  await question.click({ position: { x: 20, y: 20 } });
  await expect(page.locator('[data-companion-reading-surface]')).toHaveAttribute('data-reading-chrome-visible', 'true');
  await checkImagePreview(page, 'Question illustration');
  await expect(page.getByRole('button', { name: 'Show Answer', exact: true })).toBeInViewport();
  await page.getByRole('button', { name: 'Show Answer', exact: true }).click();
  for (const viewport of [{ width: 320, height: 700 }, { width: 700, height: 320 }]) {
    await page.setViewportSize(viewport);
    await expectImageToFit('Question illustration');
    await expectImageToFit('Answer illustration');
    await expect(page.getByRole('button', { name: 'Good', exact: true })).toBeInViewport();
  }
  const answer = page.getByRole('img', { name: 'Answer illustration', exact: true });
  await answer.scrollIntoViewIfNeeded();
  const surface = page.locator('.companion-review-surface');
  if (await surface.getAttribute('data-reading-chrome-visible') !== 'true') {
    await answer.click({ position: { x: 20, y: 20 } });
  }
  await checkImagePreview(page, 'Answer illustration');
  await expect(page.getByRole('button', { name: 'Good', exact: true })).toBeInViewport();
});

async function checkImagePreview(page: Page, name: string) {
  const trigger = page.locator('.cm-md-image-surface')
    .filter({ has: page.getByRole('img', { name, exact: true }) })
    .getByRole('button', { name: 'Open image preview', exact: true });
  await trigger.evaluate(element => element.scrollIntoView({ block: 'center' }));
  await expect(trigger).toBeInViewport({ ratio: 1 });
  const surface = page.locator('.companion-review-surface');
  const scrollTop = await surface.evaluate(element => element.scrollTop);
  await trigger.click();

  const dialog = page.getByRole('dialog', { name: 'Image preview', exact: true });
  const image = dialog.getByRole('img', { name, exact: true });
  const viewport = page.viewportSize()!;
  await expect(dialog).toBeVisible();
  expect(await dialog.boundingBox()).toEqual({ x: 0, y: 0, ...viewport });
  expect(await dialog.evaluate(element => getComputedStyle(element).backgroundColor)).toMatch(/^rgb\(/);
  const initial = (await image.boundingBox())!;
  expect(initial.x).toBeGreaterThanOrEqual(0);
  expect(initial.x + initial.width).toBeLessThanOrEqual(viewport.width);
  const x = initial.x + initial.width / 2;
  const y = initial.y + initial.height / 2;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', offsets: number[]) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: offsets.map((offset, id) => ({ x: x + offset, y, id })) });
  await touch('touchStart', [-30, 30]);
  await touch('touchMove', [-85, 85]);
  await touch('touchEnd', []);
  await expect.poll(async () => (await image.boundingBox())!.width).toBeGreaterThan(initial.width * 2);
  const zoomed = (await image.boundingBox())!;
  await touch('touchStart', [0]);
  await touch('touchMove', [55]);
  await touch('touchEnd', []);
  await expect.poll(async () => (await image.boundingBox())!.x).toBeGreaterThan(zoomed.x + 20);
  await cdp.detach();
  const close = dialog.getByRole('button', { name: 'Close image preview', exact: true });
  await expect(close).toBeInViewport();
  await close.click();
  await expect(dialog).toHaveCount(0);
  expect(await surface.evaluate(element => element.scrollTop)).toBe(scrollTop);
  await expect(page.getByRole('img', { name, exact: true })).toBeVisible();
}

for (const viewport of [{ width: 375, height: 812 }, { width: 700, height: 360 }]) {
  test(`Flow Read measures the visible topic end at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openReview(page, 'reading&question=long');
    const read = page.getByRole('button', { name: 'Read', exact: true });
    const result = page.getByLabel('Read position');
    await expect(read).toBeInViewport({ ratio: 1 });
    await read.click();
    await expect(result).toHaveText('Before end');
    await page.locator('[data-companion-reading-surface]').evaluate(surface => {
      surface.scrollTop = surface.scrollHeight;
    });
    await read.click();
    await expect(result).toHaveText('End');
  });
}

import type { Page } from '@playwright/test';

import { expect } from './harness/fixtures';

export async function dragAcrossPdfPages(page: Page, texts: string[], reverse: boolean) {
  const firstText = texts[0];
  const lastText = texts[texts.length - 1];
  if (!firstText || !lastText) throw new Error('Selection endpoints require text');
  const start = page.locator('.textLayer span').filter({ hasText: reverse ? lastText : firstText });
  const finish = page.locator('.textLayer span').filter({ hasText: reverse ? firstText : lastText });
  const startShell = page.locator(`[data-pdf-page-number="${reverse ? texts.length : 1}"]`);
  await startShell.scrollIntoViewIfNeeded();
  await expect(start).toBeVisible();
  await start.scrollIntoViewIfNeeded();
  let previous = '';
  await expect.poll(async () => {
    const layout = JSON.stringify(await start.boundingBox());
    const stable = layout === previous;
    previous = layout;
    return stable;
  }, { intervals: [150] }).toBe(true);
  const bounds = await start.boundingBox();
  const viewport = await page.getByTestId('pdf-scroll-container').boundingBox();
  if (!bounds || !viewport) throw new Error('PDF selection has no geometry');
  await page.mouse.move(bounds.x + (reverse ? bounds.width - 1 : 1), bounds.y + bounds.height / 2);
  await page.mouse.down();
  for (let step = 0; step < 30; step += 1) {
    const target = await finish.count() ? await finish.boundingBox() : null;
    if (target && target.y >= viewport.y + 10 && target.y + target.height < viewport.y + viewport.height - 10) {
      await page.mouse.move(target.x + (reverse ? 1 : target.width - 1), target.y + target.height / 2, { steps: 15 });
      await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? '')).toContain(lastText);
      return;
    }
    await page.mouse.move(bounds.x + 5, reverse ? viewport.y + 35 : viewport.y + viewport.height - 35, { steps: 5 });
    const before = await page.getByTestId('pdf-scroll-container').evaluate(element => element.scrollTop);
    await page.mouse.wheel(0, reverse ? -140 : 140);
    await expect.poll(() => page.getByTestId('pdf-scroll-container').evaluate(element => element.scrollTop)).not.toBe(before);
  }
  throw new Error('PDF selection did not reach the endpoint');
}

export async function expectPdfTextCovered(page: Page, pageNumber: number, testId: string) {
  try {
    await expect.poll(() => page.evaluate(({ number, id }) => {
      const shell = document.querySelector(`[data-pdf-page-number="${number}"]`);
      const span = shell?.querySelector('.textLayer span');
      const overlay = shell?.querySelector(`[data-testid="${id}"]`);
      if (!span || !(overlay instanceof SVGPathElement)) return false;
      const rect = span.getBoundingClientRect();
      const transform = overlay.getScreenCTM();
      return !!transform && overlay.isPointInFill(new DOMPoint(rect.x + rect.width / 2, rect.y + rect.height / 2).matrixTransform(transform.inverse()));
    }, { number: pageNumber, id: testId }), { message: `PDF page ${pageNumber} ${testId} covers its selected text` }).toBe(true);
  } catch (error) {
    console.info('Coverage geometry', await page.evaluate(number => {
      const shell = document.querySelector(`[data-pdf-page-number="${number}"]`);
      return Array.from(shell?.querySelectorAll('.react-pdf__Page, .textLayer, .textLayer span, [data-testid="pdf-highlight-fill"]') ?? [], element => ({ tag: element.tagName, box: element.getBoundingClientRect().toJSON(), style: element.getAttribute('style'), path: element.getAttribute('d') }));
    }, pageNumber));
    throw error;
  }
}

export async function verifyCrossPageExcerpt(page: Page, numbers: number[], excerptId: string, parent: string, usePageNavigation = false) {
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.isHydrated())).toBe(true);
  await expect(page.getByTestId('pdf-document-surface')).toBeVisible();
  await expect(page.getByTestId('pdf-document-loading-overlay')).toHaveCount(0);
  for (const number of numbers) {
    if (usePageNavigation) {
      const input = page.getByRole('textbox', { name: /PDF page|PDF 页码/ });
      await input.fill(String(number));
      await input.press('Enter');
    } else await page.locator(`[data-pdf-page-number="${number}"]`).scrollIntoViewIfNeeded();
    await expectPdfTextCovered(page, number, 'pdf-highlight-fill');
    await expect(page.locator(`[data-pdf-page-number="${number}"] [data-pdf-highlight-node-id="${excerptId}"]`).first()).toBeVisible();
  }
  for (const number of [numbers[0], numbers[numbers.length - 1]]) {
    const input = page.getByRole('textbox', { name: /PDF page|PDF 页码/ });
    await input.fill(String(number));
    await input.press('Enter');
    const marker = page.locator(`[data-pdf-page-number="${number}"] [data-pdf-highlight-node-id="${excerptId}"]`).first();
    await expect(marker).toBeVisible();
    const bounds = await marker.boundingBox();
    if (!bounds) throw new Error('Highlight has no geometry');
    await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.locator('[data-annotation-toolbar="true"]').getByRole('button', { name: /^(Open|打开)$/ }).click();
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId())).toBe(excerptId);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
    await page.getByRole('dialog', { name: /Command palette|命令面板/ }).locator('button[aria-label="Go Up"], button[aria-label="返回上级"]').click();
    await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId())).toBe(parent);
    await expect(page.locator('[data-pdf-page-number="1"] [data-testid="pdf-highlight-fill"]')).toBeInViewport();
  }
}

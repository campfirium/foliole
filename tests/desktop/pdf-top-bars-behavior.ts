import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect } from './harness/fixtures';
import { revealPdfBars } from './pdf-top-bars-interaction';

export async function verifyFlatPdfBars(page: Page) {
  const navigationBackground = await page.getByTestId('pdf-document-top-bar').evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(await page.locator('[data-pdf-reading-toolbar]').evaluate((element) => getComputedStyle(element).backgroundColor)).toBe(navigationBackground);
  for (const selector of ['[data-testid="pdf-window-top-bar"]', '[data-testid="pdf-document-top-bar"]', '[data-pdf-reading-toolbar]']) {
    const shadow = await page.locator(selector).evaluate((element) => getComputedStyle(element).boxShadow);
    const colors = shadow.match(/rgba?\([^)]*\)/g) ?? [];
    expect(shadow === 'none' || (colors.length > 0 && colors.every((color) => color.startsWith('rgba(') && Number(color.slice(color.lastIndexOf(',') + 1, -1)) === 0))).toBe(true);
  }
  await page.screenshot({ path: path.resolve('.tmp/artifacts/pdf-top-bars/flat-bars.png') });
}

export async function verifyScrollRevealsOnlyToolbar(page: Page) {
  const scroll = page.getByTestId('pdf-scroll-container');
  await scroll.locator('.pdf-document-page-frame').first().click({ position: { x: 20, y: 250 } });
  await expect(page.getByTestId('pdf-document-top-bar')).toHaveAttribute('data-visible', 'false');
  await scroll.evaluate((element) => { element.scrollTop = 300; });
  await page.waitForTimeout(100);
  await scroll.evaluate((element) => { element.scrollTop = 380; });
  await page.waitForTimeout(100);
  await scroll.evaluate((element) => { element.scrollTop = 340; });
  await expect(page.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'true');
  await expect(page.getByTestId('pdf-document-top-bar')).toHaveAttribute('data-visible', 'false');
  await expect(page.getByTestId('pdf-window-top-bar')).toHaveAttribute('data-visible', 'false');
  await page.screenshot({ path: path.resolve('.tmp/artifacts/pdf-top-bars/toolbar-only.png') });
  await revealPdfBars(page);
}

export async function verifyUpperSideReveal(page: Page) {
  const scroll = page.getByTestId('pdf-scroll-container');
  await page.getByRole('button', { name: /Fit width|适合宽度/ }).click();
  // Fit width leaves the page and toolbar inside the panel, so no stale horizontal scroll hides the side whitespace.
  await expect.poll(() => scroll.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(0);
  for (const side of ['left', 'right']) for (const row of [0, 1, 2]) {
    await scroll.click({ position: { x: await scroll.evaluate((element) => element.clientWidth / 2), y: 240 } });
    await expect(page.getByTestId('pdf-document-top-bar')).toHaveAttribute('data-visible', 'false');
    const point = await page.getByTestId('pdf-top-bars-reveal-zone').evaluate((element, args) => {
      const bounds = element.getBoundingClientRect();
      const toolbar = element.querySelector<HTMLElement>('[data-pdf-reading-toolbar]');
      const shell = element.querySelector<HTMLElement>('[data-pdf-toolbar-shell]');
      if (!toolbar || !shell) throw new Error('PDF toolbar bounds unavailable');
      const panel = toolbar.getBoundingClientRect();
      const bottom = shell.getBoundingClientRect().top + toolbar.offsetTop + toolbar.offsetHeight;
      return {
        x: args.side === 'left' ? (bounds.left + panel.left) / 2 : (panel.right + bounds.right) / 2,
        y: bounds.top + (bottom - bounds.top) * (args.row + 0.5) / 3
      };
    }, { side, row });
    await page.mouse.move(point.x, point.y);
    await expect(page.getByTestId('pdf-document-top-bar')).toHaveAttribute('data-visible', 'true', { timeout: 1000 });
    await expect(page.getByTestId('pdf-window-top-bar')).toHaveAttribute('data-visible', 'true', { timeout: 1000 });
  }
  await page.screenshot({ path: path.resolve('.tmp/artifacts/pdf-top-bars/upper-side-reveal.png') });
  await page.getByRole('button', { name: /Set zoom level|设置缩放级别/ }).click();
  await page.getByRole('menuitem', { name: '100%', exact: true }).click();
}

export async function dismissFromReading(page: Page) {
  const scroll = page.getByTestId('pdf-scroll-container');
  const position = await scroll.evaluate((container) => {
    const viewport = container.getBoundingClientRect();
    const toolbarBottom = container.querySelector('[data-pdf-reading-toolbar]')?.getBoundingClientRect().bottom ?? viewport.top;
    for (const frame of container.querySelectorAll('.pdf-document-page-frame')) {
      const paper = frame.getBoundingClientRect();
      const top = Math.max(paper.top, viewport.top, toolbarBottom);
      const bottom = Math.min(paper.bottom, viewport.bottom);
      if (bottom - top < 24) continue;
      const x = Math.max(viewport.left, paper.left) + 20;
      const y = (top + bottom) / 2;
      if (frame.contains(document.elementFromPoint(x, y))) return { x, y };
    }
    throw new Error('No visible PDF paper below the toolbar');
  });
  await page.mouse.click(position.x, position.y);
  await expect(page.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'false', { timeout: 1000 });
  await expect(page.getByTestId('pdf-document-top-bar')).toHaveAttribute('data-visible', 'false', { timeout: 1000 });
  await expect(page.getByTestId('pdf-window-top-bar')).toHaveAttribute('data-visible', 'false', { timeout: 1000 });
  await page.screenshot({ path: path.resolve('.tmp/artifacts/pdf-top-bars/click-dismissed.png') });
}

import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { createVisualPdfFixture, importPdf } from './pdf-image-excerpt-test-support';

async function fitVisualFixture(desktopWindow: Page) {
  await desktopWindow.getByRole('button', { name: /^(Custom fit|自定义适配)$/ }).click();
  await desktopWindow.getByRole('button', { name: /^(Confirm|确认)$/ }).click();
  await desktopWindow.getByRole('button', { name: /Set zoom level|设置缩放级别/ }).click();
  await desktopWindow.getByRole('menuitem', { name: '100%' }).click();
  await expect.poll(() => desktopWindow.locator('.react-pdf__Page canvas').first().evaluate(canvas => canvas.getBoundingClientRect().width)).toBe(200);
  await desktopWindow.getByTestId('pdf-scroll-container').hover({ position: { x: 300, y: 300 } });
  await desktopWindow.mouse.wheel(0, -2000);
  await expect.poll(() => desktopWindow.getByTestId('pdf-scroll-container').evaluate(container => container.scrollTop)).toBe(0);
}

async function dragPageRegion(desktopWindow: Page, withModifier = false) {
  const page = desktopWindow.locator('.pdf-visual-excerpt-page').first();
  const bounds = await page.boundingBox();
  if (!bounds) throw new Error('PDF page has no bounds');
  if (withModifier) await desktopWindow.keyboard.down('Alt');
  await desktopWindow.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.85);
  await desktopWindow.mouse.down();
  await desktopWindow.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.97);
  await desktopWindow.mouse.up();
  if (withModifier) await desktopWindow.keyboard.up('Alt');
}

async function dragFromTextToVisualArea(desktopWindow: Page) {
  const textBounds = await desktopWindow.locator('.textLayer span:not(.endOfContent)').first().boundingBox();
  const pageBounds = await desktopWindow.locator('.pdf-visual-excerpt-page').first().boundingBox();
  if (!textBounds || !pageBounds) throw new Error('PDF mixed page has no drag bounds');
  await desktopWindow.mouse.move(textBounds.x + 2, textBounds.y + textBounds.height / 2);
  await desktopWindow.mouse.down();
  await desktopWindow.mouse.move(pageBounds.x + pageBounds.width * 0.82, pageBounds.y + pageBounds.height * 0.98);
  await desktopWindow.mouse.up();
}

test.beforeEach(async ({ desktopWindow }) => {
  const exitFlow = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  await expect(exitFlow).toBeVisible();
  await exitFlow.click();
});

for (const scenario of [
  { name: 'mixed', text: 'Mixed PDF text layer' },
  { name: 'scanned', text: null }
]) {
  test(`PDF region excerpt @pdf uses ordinary and quick gestures on ${scenario.name} pages`, async ({
    desktopApp,
    desktopWindow
  }) => {
    const fixturePath = path.resolve(`.tmp/artifacts/pdf-region-excerpt-${scenario.name}.pdf`);
    createVisualPdfFixture(fixturePath, scenario.text, 60);
    await importPdf(desktopApp, desktopWindow, fixturePath);
    await fitVisualFixture(desktopWindow);
    const toggle = desktopWindow.getByRole('button', { name: /Region excerpt|区域摘录/ });
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.focus();
    await expect(desktopWindow.getByRole('tooltip')).toContainText(/Region excerpt \(Ordinary\)|区域摘录（常规）/);
    await expect(desktopWindow.getByRole('tooltip')).toContainText(/Hold ⌥|按住 ⌥/);
    if (scenario.text) {
      const text = desktopWindow.locator('.textLayer span:not(.endOfContent)').first();
      await expect(text).toHaveCSS('cursor', 'text');
      const bounds = await text.boundingBox();
      if (!bounds) throw new Error('PDF text has no bounds');
      await desktopWindow.evaluate(() => {
        window.addEventListener('pointerdown', (event) => { document.documentElement.dataset.t158PointerDefault = String(event.defaultPrevented); }, { once: true });
        window.addEventListener('mousedown', (event) => { document.documentElement.dataset.t158MouseDefault = String(event.defaultPrevented); }, { once: true });
      });
      await desktopWindow.mouse.move(bounds.x + 2, bounds.y + bounds.height / 2);
      await desktopWindow.mouse.down();
      await desktopWindow.mouse.move(bounds.x + bounds.width - 2, bounds.y + bounds.height / 2, { steps: 12 });
      await desktopWindow.mouse.up();
      await expect.poll(() => desktopWindow.evaluate(() => document.documentElement.dataset.t158PointerDefault)).toBe('false');
      await expect.poll(() => desktopWindow.evaluate(() => document.documentElement.dataset.t158MouseDefault)).toBe('false');
      const selectedText = await text.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
        return selection?.toString();
      });
      expect(selectedText).toContain(scenario.text);
    }
    const page = desktopWindow.locator('.pdf-visual-excerpt-page').first();
    await expect(page).toHaveCSS('cursor', 'default');
    await dragPageRegion(desktopWindow);
    await expect(desktopWindow.getByRole('treeitem', { name: /Excerpt 1/ })).toHaveCount(0);
    if (scenario.text) {
      await dragPageRegion(desktopWindow, true);
    } else {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-pressed', 'true');
      await expect(page).toHaveCSS('cursor', 'crosshair');
      await dragPageRegion(desktopWindow);
    }
    await expect(desktopWindow.getByRole('treeitem', { name: /Excerpt 1/ })).toBeVisible();
    if (scenario.text) {
      await toggle.click();
      await dragFromTextToVisualArea(desktopWindow);
      await expect(desktopWindow.getByRole('treeitem', { name: /Excerpt 2/ })).toBeVisible();
    }
    await expect(desktopWindow.getByTestId('pdf-image-excerpt-outline').first()).toBeVisible();
    await desktopWindow.screenshot({ path: path.resolve(`.tmp/artifacts/pdf-region-excerpt-${scenario.name}-visible.png`) });
  });
}

import path from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { importPdf } from './pdf-image-excerpt-test-support';
import { createTwoColumnPdf } from './pdf-selection-two-column-fixture';

const LEFT_TEXT = 'Boundary phrase begins';
const RIGHT_TEXT = 'and continues across columns';

async function dragAcrossColumns(page: Page, reverse: boolean) {
  let previousLayout = '';
  await expect.poll(async () => {
    const layout = await page.locator('.textLayer span').evaluateAll(spans => JSON.stringify(spans.map(span => {
      const { x, y, width, height } = span.getBoundingClientRect();
      return { x, y, width, height };
    })));
    const stable = previousLayout === layout;
    previousLayout = layout;
    return stable;
  }, { intervals: [150] }).toBe(true);
  const left = page.locator('.textLayer span').filter({ hasText: LEFT_TEXT }).first();
  const right = page.locator('.textLayer span').filter({ hasText: RIGHT_TEXT }).first();
  const leftBox = await left.boundingBox();
  const rightBox = await right.boundingBox();
  if (!leftBox || !rightBox) throw new Error('Two-column text is not rendered');
  const beginning = { x: leftBox.x + 3, y: leftBox.y + leftBox.height / 2 };
  const end = { x: rightBox.x + rightBox.width - 3, y: rightBox.y + rightBox.height / 2 };
  await page.mouse.click(beginning.x, beginning.y);
  await page.mouse.move(beginning.x, beginning.y + 25);
  await expect(page.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'false');
  const start = reverse ? end : beginning;
  const finish = reverse ? beginning : end;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  if (!reverse) {
    await page.mouse.move(leftBox.x + leftBox.width / 2, start.y, { steps: 8 });
    await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? '')).not.toBe('');
    await expectUniformSelectionColor(page);
  }
  for (const progress of [0.25, 0.5, 0.75, 1]) {
    await page.mouse.move(start.x + (finish.x - start.x) * progress, start.y + (finish.y - start.y) * progress, { steps: 8 });
    await expectUnselectedPageSpaceClear(page);
  }
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? '')).toContain('continues across');
  await expectBothColumnsCovered(page, 'pdf-selection-rect');
  await expectUniformSelectionColor(page);
  await page.screenshot({ path: path.resolve(`.tmp/artifacts/pdf-two-column-dragging-${reverse}.png`) });
  const before = await page.evaluate(() => window.getSelection()?.toString() ?? '');
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe(before);
  expect(before).toContain('phrase begins');
  expect(before).toContain('continues across');
}

async function expectUnselectedPageSpaceClear(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const overlay = document.querySelector('[data-testid="pdf-selection-rect"]');
    const layer = document.querySelector('.textLayer');
    if (!(overlay instanceof SVGPathElement) || !layer) return false;
    const box = layer.getBoundingClientRect();
    const point = new DOMPoint(box.x + box.width / 2, box.y + box.height / 2);
    const transform = overlay.getScreenCTM();
    return !!transform && !overlay.isPointInFill(point.matrixTransform(transform.inverse()));
  })).toBe(true);
}

async function expectBothColumnsCovered(page: Page, testId: string) {
  await expect.poll(() => page.evaluate(({ texts, id }) => {
    const spans = Array.from(document.querySelectorAll<HTMLElement>('.textLayer span'));
    const highlights = Array.from(document.querySelectorAll<HTMLElement | SVGPathElement>(`[data-testid="${id}"]`));
    return texts.every(text => {
      const element = spans.find(span => span.textContent?.includes(text));
      if (!element) return false;
      const box = element.getBoundingClientRect();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      return highlights.some(element => {
        if (element instanceof SVGPathElement) {
          const transform = element.getScreenCTM();
          return !!transform && element.isPointInFill(new DOMPoint(x, y).matrixTransform(transform.inverse()));
        }
        const rect = element.getBoundingClientRect();
        return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
      });
    });
  }, { texts: [LEFT_TEXT, RIGHT_TEXT], id: testId })).toBe(true);
}

async function expectUniformSelectionColor(page: Page) {
  const screenshot = await page.screenshot();
  const result = await page.evaluate(async (bytes) => {
    const overlay = document.querySelector('[data-testid="pdf-selection-rect"]');
    const range = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
    if (!overlay || !range) throw new Error('Selection is not visible');
    const reference = document.createElement('canvas');
    reference.width = reference.height = 1;
    const color = reference.getContext('2d');
    if (!color) throw new Error('Cannot read selection color');
    color.fillStyle = 'white';
    color.fillRect(0, 0, 1, 1);
    const style = getComputedStyle(overlay);
    color.fillStyle = overlay instanceof SVGPathElement ? style.fill : style.backgroundColor;
    color.fillRect(0, 0, 1, 1);
    const expected = color.getImageData(0, 0, 1, 1).data;
    const image = await createImageBitmap(new Blob([Uint8Array.from(bytes)], { type: 'image/png' }));
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Cannot read screenshot');
    context.drawImage(image, 0, 0);
    image.close();
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const scale = canvas.width / window.innerWidth;
    let painted = 0, darkened = 0;
    for (const rect of range.getClientRects()) {
      for (let y = Math.ceil(rect.top * scale); y < Math.floor(rect.bottom * scale); y++) {
        for (let x = Math.ceil(rect.left * scale); x < Math.floor(rect.right * scale); x++) {
          const index = (y * canvas.width + x) * 4;
          if (pixels[index + 2] !== expected[2] || pixels[index] >= 250) continue;
          painted++;
          if (pixels[index] < expected[0] - 1 && pixels[index + 1] < expected[1] - 1) darkened++;
        }
      }
    }
    return { painted, darkened };
  }, Array.from(screenshot));
  expect(result.painted).toBeGreaterThan(0);
  expect(result.darkened).toBe(0);
}

for (const reverse of [false, true]) {
  test(`PDF two-column selection @pdf preserves text and saved highlight, reverse=${reverse}`, async ({ desktopApp, desktopWindow }) => {
    const fixture = path.resolve(`.tmp/artifacts/pdf-two-column-native-${reverse}.pdf`);
    createTwoColumnPdf(fixture);
    const exitFlow = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
    await expect(exitFlow).toBeVisible();
    await exitFlow.click();
    await importPdf(desktopApp, desktopWindow, fixture);
    await desktopWindow.getByRole('button', { name: /^(Manual view|手动视图)$/ }).click();
    await desktopWindow.getByRole('button', { name: /^(Confirm|确认)$/ }).click();
    await desktopWindow.getByRole('button', { name: /Set zoom level|设置缩放级别/ }).click();
    await desktopWindow.getByRole('menuitem', { name: '100%' }).click();
    await expect(desktopWindow.locator('.textLayer')).toContainText(RIGHT_TEXT);
    await expect.poll(() => desktopWindow.evaluate(() => {
      const layer = document.querySelector('.textLayer');
      const canvas = document.querySelector('.react-pdf__Page canvas');
      return !!layer && !!canvas && Math.abs(layer.getBoundingClientRect().width - canvas.getBoundingClientRect().width) < 1;
    })).toBe(true);
    await dragAcrossColumns(desktopWindow, reverse);
    await expectBothColumnsCovered(desktopWindow, 'pdf-selection-rect');
    await expectUniformSelectionColor(desktopWindow);
    await desktopWindow.screenshot({ path: path.resolve(`.tmp/artifacts/pdf-two-column-selection-${reverse}.png`) });
    await desktopWindow.getByRole('button', { name: /^(Highlight|高亮)$/ }).click();
    await expectBothColumnsCovered(desktopWindow, 'pdf-highlight-rect');
    await expect(desktopWindow.getByRole('treeitem', { name: /phrase begins.*continues across/ })).toBeVisible();
    await desktopWindow.screenshot({ path: path.resolve(`.tmp/artifacts/pdf-two-column-saved-${reverse}.png`) });
    await desktopWindow.reload();
    await expectBothColumnsCovered(desktopWindow, 'pdf-highlight-rect');
  });
}

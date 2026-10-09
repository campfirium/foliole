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

async function expectUniformSelectionColor(page: Page, testId = 'pdf-selection-rect') {
  const screenshot = await page.screenshot();
  const result = await page.evaluate(async ({ bytes, id }) => {
    const overlay = document.querySelector(id === 'pdf-highlight-rect'
      ? '[data-testid="pdf-highlight-fill"], [data-testid="pdf-highlight-rect"]'
      : `[data-testid="${id}"]`);
    const range = window.getSelection()?.rangeCount ? window.getSelection()?.getRangeAt(0) : null;
    if (!overlay) throw new Error('Highlight is not visible');
    const rects = id === 'pdf-selection-rect' && range
      ? Array.from(range.getClientRects())
      : Array.from(document.querySelectorAll(`[data-testid="${id}"]`), element => element.getBoundingClientRect());
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
    const reference = document.createElement('canvas');
    reference.width = reference.height = 1;
    const color = reference.getContext('2d');
    if (!color) throw new Error('Cannot read selection color');
    const layer = document.querySelector('.textLayer')?.getBoundingClientRect();
    if (!layer) throw new Error('PDF page is not visible');
    const background = context.getImageData(Math.floor((layer.x + layer.width / 2) * scale),
      Math.floor((layer.y + layer.height / 2) * scale), 1, 1).data;
    color.fillStyle = `rgb(${background[0]} ${background[1]} ${background[2]})`;
    color.fillRect(0, 0, 1, 1);
    const style = getComputedStyle(overlay);
    color.fillStyle = overlay instanceof SVGPathElement ? style.fill : style.backgroundColor;
    color.fillRect(0, 0, 1, 1);
    const expected = color.getImageData(0, 0, 1, 1).data;
    color.fillRect(0, 0, 1, 1);
    const doubled = color.getImageData(0, 0, 1, 1).data;
    let painted = 0, darkened = 0;
    for (const rect of rects) {
      for (let y = Math.ceil(rect.top * scale); y < Math.floor(rect.bottom * scale); y++) {
        for (let x = Math.ceil(rect.left * scale); x < Math.floor(rect.right * scale); x++) {
          const index = (y * canvas.width + x) * 4;
          if ([0, 1, 2].every(channel => Math.abs(pixels[index + channel] - expected[channel]) <= 1)) painted++;
          if ([0, 1, 2].every(channel => Math.abs(pixels[index + channel] - doubled[channel]) <= 1)) darkened++;
        }
      }
    }
    return { painted, darkened };
  }, { bytes: Array.from(screenshot), id: testId });
  expect(result.painted).toBeGreaterThan(0);
  expect(result.darkened).toBe(0);
}

async function expectSavedFragmentCoverage(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const fill = document.querySelector('[data-testid="pdf-highlight-fill"]');
    if (!(fill instanceof SVGPathElement)) return false;
    const texts = ['Sentence.', 'x', 'The continuation'];
    const boxes = texts.map(text => {
      const span = Array.from(document.querySelectorAll('.textLayer span')).find(element => element.textContent === text);
      if (!span?.firstChild) return null;
      const range = document.createRange();
      range.selectNodeContents(span);
      return range.getBoundingClientRect();
    });
    const [first, formula, last] = boxes;
    const transform = fill.getScreenCTM();
    if (!first || !formula || !last || !transform) return false;
    const covered = (x: number, y: number) => fill.isPointInFill(new DOMPoint(x, y).matrixTransform(transform.inverse()));
    return formula.left > first.right && last.left > formula.right &&
      covered((first.right + formula.left) / 2, first.y + first.height / 2) &&
      covered((formula.right + last.left) / 2, last.y + last.height / 2) &&
      covered(formula.x + formula.width / 2, Math.max(first.bottom, last.bottom) - 1);
  })).toBe(true);
}

for (const reverse of [false, true]) {
  test(`PDF two-column selection @pdf preserves text and saved highlight, reverse=${reverse}`, async ({ desktopApp, desktopWindow }) => {
    const fixture = path.resolve(`.tmp/artifacts/pdf-two-column-native-${reverse}.pdf`);
    createTwoColumnPdf(fixture);
    const exitFlow = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
    await expect(exitFlow).toBeVisible();
    await exitFlow.click();
    if (reverse) await desktopWindow.evaluate(() => {
      window.localStorage.setItem('foliole-base-color', 'dark');
      window.localStorage.setItem('foliole-pdf-reading-mode', 'inverted');
      document.documentElement.dataset.resolvedBaseColor = 'dark';
      document.documentElement.dataset.pdfReadingMode = 'inverted';
    });
    await importPdf(desktopApp, desktopWindow, fixture);
    await desktopWindow.getByRole('button', { name: /^(Custom fit|自定义适配)$/ }).click();
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
    await expectUniformSelectionColor(desktopWindow, 'pdf-highlight-rect');
    await expectSavedFragmentCoverage(desktopWindow);
    await expect(desktopWindow.getByRole('treeitem', { name: /phrase begins.*continues across/ })).toBeVisible();
    await desktopWindow.screenshot({ path: path.resolve(`.tmp/artifacts/pdf-two-column-saved-${reverse}.png`) });
    await desktopWindow.reload();
    await expectBothColumnsCovered(desktopWindow, 'pdf-highlight-rect');
    await expectUniformSelectionColor(desktopWindow, 'pdf-highlight-rect');
    await expectSavedFragmentCoverage(desktopWindow);
  });
}

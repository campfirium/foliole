import { expect, it } from 'vitest';

import { resolvePageJumpTop } from './pdfPageJumpScroll';
import { resolveVisiblePage, resolveVisiblePositionY } from './pdfVisiblePageMetrics';

it.each([859, 870])('restores the saved page at its start with a %i pixel viewport', (height) => {
  const container = { clientHeight: height, scrollTop: 0 } as HTMLDivElement;
  const previous = { offsetTop: 1000, clientHeight: 800 } as HTMLDivElement;
  const target = { offsetTop: 2000, clientHeight: 800 } as HTMLDivElement;
  // Native Chromium can quantize the requested scroll offset to a CSS pixel.
  container.scrollTop = Math.round(resolvePageJumpTop(container, target, 0));
  const pages = { current: { 1: previous, 2: target } };
  expect(resolveVisiblePage(container, pages, 2)).toBe(2);
  expect(resolveVisiblePositionY(container, target)).toBeLessThan(1 / target.clientHeight);
});

it('preserves an interior reading position within one rendered pixel', () => {
  const container = { clientHeight: 859, scrollTop: 0 } as HTMLDivElement;
  const target = { offsetTop: 2000, clientHeight: 800 } as HTMLDivElement;
  container.scrollTop = Math.round(resolvePageJumpTop(container, target, 0.45));
  expect(Math.abs(resolveVisiblePositionY(container, target) - 0.45)).toBeLessThan(1 / target.clientHeight);
});

it('uses original page coordinates for highlight jumps and reading restoration inside a cropped view', () => {
  const container = document.createElement('div');
  const shell = document.createElement('div');
  const page = document.createElement('div');
  page.className = 'react-pdf__Page';
  shell.append(page);
  Object.defineProperties(container, { clientHeight: { value: 400 }, scrollTop: { value: 0, writable: true } });
  Object.defineProperties(shell, { offsetTop: { value: 1000 }, clientHeight: { value: 600 } });
  shell.getBoundingClientRect = () => ({ top: 1000 } as DOMRect);
  page.getBoundingClientRect = () => ({ top: 900, height: 800 } as DOMRect);
  container.scrollTop = resolvePageJumpTop(container, shell, .75);
  expect(container.scrollTop + container.clientHeight * .35).toBe(900 + 800 * .75);
  expect(resolveVisiblePositionY(container, shell)).toBeCloseTo(.75);
});

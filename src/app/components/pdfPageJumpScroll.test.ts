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

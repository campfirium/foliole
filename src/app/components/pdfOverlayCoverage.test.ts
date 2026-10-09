import { expect, it } from 'vitest';

import { resolvePdfOverlayCoverage } from './pdfOverlayCoverage';

const page = { width: 612, height: 792 };
type Rect = Parameters<typeof resolvePdfOverlayCoverage>[0][number];
const rect = (x: number, y: number, width: number, height: number): Rect => ({
  x: x / page.width, y: y / page.height, width: width / page.width, height: height / page.height
});
function covers(rects: Rect[], x: number, y: number) {
  return rects.some(r => x / page.width >= r.x && x / page.width <= r.x + r.width &&
    y / page.height >= r.y && y / page.height <= r.y + r.height);
}

it('covers a wide sentence space between selected fragments without extending the selection ends', () => {
  const source = [rect(50, 440, 72.8, 14.14), rect(122.8, 440, 3.32, 14.14), rect(128.89, 440, 157.48, 14.14)];
  const coverage = resolvePdfOverlayCoverage(source, page);
  expect(covers(coverage, 127.5, 447)).toBe(true);
  expect(covers(coverage, 49, 447)).toBe(false);
  expect(covers(coverage, 287, 447)).toBe(false);
  expect(source[1]?.width).toBe(3.32 / page.width);
});

it('covers the full line height across a shorter formula fragment and its adjoining spaces', () => {
  const coverage = resolvePdfOverlayCoverage([
    rect(50, 350, 20, 14.14), rect(72, 350.86, 6, 11.31), rect(79, 350, 20, 14.14)
  ], page);
  expect(covers(coverage, 75, 363)).toBe(true);
  expect(covers(coverage, 71, 357)).toBe(true);
});

it('preserves column gaps and separate lines even when line boxes overlap vertically', () => {
  const coverage = resolvePdfOverlayCoverage([
    rect(50, 350, 100, 14), rect(330, 350, 100, 14), rect(100, 362, 100, 14)
  ], page);
  expect(covers(coverage, 240, 357)).toBe(false);
  expect(covers(coverage, 60, 372)).toBe(false);
  expect(covers(coverage, 180, 354)).toBe(false);
});

it('uses page proportions so landscape and portrait pages have the same physical gap coverage', () => {
  for (const dimensions of [page, { width: 1200, height: 400 }]) {
    const source = [{ x: 50 / dimensions.width, y: 100 / dimensions.height, width: 20 / dimensions.width, height: 14 / dimensions.height },
      { x: 74 / dimensions.width, y: 100 / dimensions.height, width: 20 / dimensions.width, height: 14 / dimensions.height }];
    const coverage = resolvePdfOverlayCoverage(source, dimensions);
    expect(coverage.some(r => 72 / dimensions.width >= r.x && 72 / dimensions.width <= r.x + r.width)).toBe(true);
  }
});

it('connects text in its reading direction when the PDF page is rotated', () => {
  const source = [rect(50, 350, 20, 14), rect(74, 350, 20, 14)];
  const swap = (r: Rect): Rect => ({ x: r.y, y: r.x, width: r.height, height: r.width });
  for (const rotation of [90, 270]) {
    const rotated = resolvePdfOverlayCoverage(source.map(swap), { width: page.height, height: page.width }, rotation);
    expect(covers(rotated.map(swap), 72, 357)).toBe(true);
    expect(covers(rotated.map(swap), 48, 357)).toBe(false);
  }
});

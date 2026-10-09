import { expect, it } from 'vitest';

import { alignPdfHeightFit, resolvePdfHeightFit } from './pdfHeightFitGeometry';

const range = { x: 0.1, y: 0.15, width: 0.8, height: 0.75 };
it('fits content height by scaling the complete page without constraining its width', () => {
  const fit = resolvePdfHeightFit({ width: 600, height: 800 }, range, 916, 0);
  expect(fit.zoom).toBe(150);
  expect(fit.pageHeight).toBe(1200);
  expect(fit.pageWidth).toBe(900);
  expect(fit.pageHeight * fit.rect.height).toBe(900);
});
it('uses the rotated content height while preserving full rotated page dimensions', () => {
  const fit = resolvePdfHeightFit({ width: 600, height: 800 }, range, 496, 90);
  expect(fit.zoom).toBe(100);
  expect(fit.pageHeight).toBe(600);
  expect(fit.pageWidth).toBe(800);
});
it('positions the content top and horizontal center without altering the page', () => {
  const container = document.createElement('div');
  const shell = document.createElement('div');
  const page = document.createElement('div');
  page.dataset.testid = 'pdf-document-page-frame';
  shell.append(page);
  Object.defineProperty(container, 'clientWidth', { value: 500 });
  container.getBoundingClientRect = () => ({ top: 20, left: 10 }) as DOMRect;
  page.getBoundingClientRect = () => ({ top: 120, left: 30 }) as DOMRect;
  const fit = resolvePdfHeightFit({ width: 600, height: 800 }, range, 916, 0);
  alignPdfHeightFit(container, shell, fit);
  expect(container.scrollTop).toBe(272);
  expect(container.scrollLeft).toBe(220);
  expect(shell.children).toHaveLength(1);
});

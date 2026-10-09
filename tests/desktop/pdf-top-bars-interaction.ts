import type { Page } from '@playwright/test';

import { expect } from './harness/fixtures';

export async function revealPdfBars(page: Page, side: 'left' | 'right' = 'left') {
  const toggle = page.getByRole('button', { name: /Auto-hide top bars|自动隐藏顶部栏/ });
  await expect(toggle).toBeEnabled();
  if (await toggle.getAttribute('aria-pressed') === 'false') {
    await page.getByTestId('pdf-toolbar-reveal-zone').hover();
    return;
  }
  const point = await page.getByTestId('pdf-scroll-container').evaluate((container, marginSide) => {
    const viewport = container.getBoundingClientRect();
    const y = viewport.top + viewport.height / 2;
    const distance = (box: DOMRect) => Math.max(box.top - y, y - box.bottom, 0);
    const nearest = Array.from(container.querySelectorAll('.pdf-document-page-frame'))
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 0)
      .sort((first, second) => distance(first) - distance(second))[0];
    if (!nearest) throw new Error('PDF page bounds unavailable');
    const left = viewport.left;
    const right = viewport.left + container.clientWidth;
    const x = marginSide === 'left' ? (left + nearest.left) / 2 : (nearest.right + right) / 2;
    if (x <= left || x >= right) throw new Error(`PDF ${marginSide} whitespace unavailable: ${JSON.stringify({ viewport: viewport.toJSON(), nearest: nearest.toJSON(), clientWidth: container.clientWidth, scrollLeft: container.scrollLeft })}`);
    return { x, y };
  }, side);
  const margin = page.getByTestId('pdf-top-bars-reveal-zone');
  const bounds = await margin.boundingBox();
  if (!bounds) throw new Error('PDF margin surface unavailable');
  await margin.hover({ position: { x: point.x - bounds.x, y: point.y - bounds.y } });
}

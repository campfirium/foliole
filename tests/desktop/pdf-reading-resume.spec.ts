import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { Page } from '@playwright/test';

import { decodePdfReadingPosition } from '../../lib/platform/pdfReadingPosition';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';
import { importWorkingSetPdf, openWorkingSetPdf, writeWorkingSetPdf } from './pdf-working-set-fixture';

async function loadPosition(page: Page, nodeId: string, pdfAttachmentId: string) {
  const context = await page.evaluate(args => window.electronAPI.invoke('load_reading_resume', args), {
    nodeId, pdfAttachmentId
  });
  return context?.offset == null ? null : decodePdfReadingPosition(context.offset);
}

async function visiblePageFraction(page: Page, pageNumber: number) {
  return page.locator(`[data-pdf-page-number="${pageNumber}"] .react-pdf__Page`).evaluate(element => {
    const container = element.closest('[data-testid="pdf-scroll-container"]')!.getBoundingClientRect();
    const paper = element.getBoundingClientRect();
    return (container.top + container.height * 0.35 - paper.top) / paper.height;
  });
}

test('original PDF resumes at the same page fraction after a zoom change and reopening', async ({
  desktopApp, desktopWindow: page
}, testInfo) => {
  await expectWorkspaceShell(page);
  const file = testInfo.outputPath('long-original.pdf');
  await writeWorkingSetPdf(file);
  const hash = createHash('sha256').update(await readFile(file)).digest('hex');
  const nodeId = await importWorkingSetPdf(desktopApp, page, file);
  await openWorkingSetPdf(page, nodeId);
  const pageInput = page.getByRole('textbox', { name: /PDF page|PDF 页码/ });
  await pageInput.fill('19');
  await pageInput.press('Enter');
  const readPosition = () => loadPosition(page, nodeId, hash);
  await expect.poll(readPosition).toEqual({ page: 19, positionY: 0 });

  const scroller = page.getByTestId('pdf-scroll-container');
  await expect(page.locator('[data-pdf-page-number="19"] canvas')).toBeInViewport();
  await scroller.hover();
  await page.mouse.wheel(0, 140);
  await expect.poll(async () => (await readPosition())?.positionY ?? 0).toBeGreaterThan(0.05);
  const saved = await readPosition();
  expect(saved?.page).toBe(19);
  await expect(page.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'true');
  await page.getByRole('button', { name: /Set zoom level|设置缩放级别/ }).click();
  await page.getByRole('menuitem', { name: '150%' }).click();
  await expect(page.getByTestId('pdf-zoom-value')).toHaveText('150%');
  expect(await readPosition()).toEqual(saved);

  await page.reload();
  await expectWorkspaceShell(page);
  await openWorkingSetPdf(page, nodeId);
  await expect(pageInput).toHaveValue('19');
  await expect(page.getByTestId('pdf-zoom-value')).toHaveText('150%');
  await expect(page.locator('[data-pdf-page-number="19"] canvas')).toBeInViewport();
  await expect.poll(async () => Math.abs(await visiblePageFraction(page, 19) - saved!.positionY)).toBeLessThan(0.04);
  expect(await readPosition()).toEqual(saved);
  await page.screenshot({ path: testInfo.outputPath('pdf-resumed-after-zoom.png') });
});

import fs from 'node:fs/promises';

import type { ElectronApplication, Page, TestInfo } from '@playwright/test';

import { expect } from './harness/fixtures';

// A deterministic, mixed-size PDF: three distant matches and one cross-page phrase.
export async function writeWorkingSetPdf(filePath: string) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count 40 /Kids [${Array.from({ length: 40 }, (_, i) => `${4 + i * 2} 0 R`).join(' ')}] >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  for (let page = 1; page <= 40; page += 1) {
    const text = `${page === 20 ? 'bridge ' : ''}Working set page ${page}`
      + ([8, 20, 35].includes(page) ? ' distantneedle' : '')
      + (page === 19 ? ' crimson' : '');
    const stream = `BT /F1 18 Tf 60 650 Td (${text}) Tj ET\n`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page % 2 ? '600 800' : '700 900'}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + (page - 1) * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  }
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  await fs.writeFile(filePath, pdf);
}

export async function importWorkingSetPdf(app: ElectronApplication, page: Page, filePath: string) {
  await app.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
  }, filePath);
  const result = await page.evaluate(() => window.electronAPI?.invoke('run_text_file_import', {}));
  expect(result?.node_id).toBeTruthy();
  return result!.node_id!;
}

export async function openWorkingSetPdf(page: Page, nodeId: string) {
  await page.evaluate(async (id) => window.__folioleWorkspaceDebug?.openNode?.(id), nodeId);
  await page.locator(`[role="treeitem"][data-node-id="${nodeId}"]`).click();
  await expect(page.getByTestId('pdf-document-surface')).toBeVisible();
}

export async function readHeavyPdfPages(page: Page) {
  return page.locator('[data-testid="pdf-document-page-shell"]:has(canvas)').evaluateAll((shells) =>
    shells.map((shell) => Number((shell as HTMLElement).dataset.pdfPageNumber)));
}

export async function expectSearchTargetVisible(page: Page, pageNumber: number, testInfo: TestInfo) {
  try {
    await expect(page.locator(`[data-pdf-page-number="${pageNumber}"] [data-testid="pdf-search-match-active"]`).first()).toBeInViewport();
  } catch (error) {
    const geometry = await page.evaluate((number) => {
      const shell = document.querySelector(`[data-pdf-page-number="${number}"]`);
      const elements = shell ? [shell, ...shell.querySelectorAll('.textLayer, .textLayer span, canvas, [data-testid="pdf-search-match-active"]')] : [];
      return elements.map((element) => ({ tag: element.tagName, className: element.className,
        text: element.textContent, rect: element.getBoundingClientRect().toJSON(), style: element.getAttribute('style') }));
    }, pageNumber);
    await testInfo.attach('search-target-geometry', { body: JSON.stringify(geometry), contentType: 'application/json' });
    await page.screenshot({ path: testInfo.outputPath('search-target-failure.png') });
    throw error;
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect } from './harness/fixtures';

function pdfObject(number: number, body: Buffer | string) {
  return Buffer.concat([Buffer.from(`${number} 0 obj\n`), Buffer.from(body), Buffer.from('\nendobj\n')]);
}

export function createVisualPdfFixture(filePath: string, text: string | null) {
  const pixels = deflateSync(Buffer.from([220, 60, 60, 60, 130, 220, 80, 180, 90, 230, 190, 70]));
  const content = Buffer.from(`q\n160 0 0 160 20 20 cm\n/Im0 Do\nQ\n${text ? `BT /F1 14 Tf 24 175 Td (${text}) Tj ET\n` : ''}`);
  const resources = text ? '/XObject << /Im0 4 0 R >> /Font << /F1 6 0 R >>' : '/XObject << /Im0 4 0 R >>';
  const objects = [
    pdfObject(1, '<< /Type /Catalog /Pages 2 0 R >>'),
    pdfObject(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    pdfObject(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << ${resources} >> /Contents 5 0 R >>`),
    pdfObject(4, Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${pixels.length} >>\nstream\n`),
      pixels,
      Buffer.from('\nendstream')
    ])),
    pdfObject(5, Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`), content, Buffer.from('endstream')]))
  ];
  if (text) objects.push(pdfObject(6, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'));
  const header = Buffer.from('%PDF-1.4\n');
  const offsets: number[] = [];
  let offset = header.length;
  objects.forEach((object) => { offsets.push(offset); offset += object.length; });
  const xref = Buffer.from(['xref', `0 ${objects.length + 1}`, '0000000000 65535 f ',
    ...offsets.map((value) => `${String(value).padStart(10, '0')} 00000 n `), 'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`, 'startxref', String(offset), '%%EOF', ''].join('\n'));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.concat([header, ...objects, xref]));
}

export async function importPdf(desktopApp: ElectronApplication, desktopWindow: Page, fixturePath: string) {
  await desktopApp.evaluate(({ dialog }, selectedPath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selectedPath] });
  }, fixturePath);
  const result = await desktopWindow.evaluate(() => window.electronAPI?.invoke('run_text_file_import', {}));
  if (!result || typeof result !== 'object' || typeof result.node_id !== 'string') {
    throw new Error(`PDF import failed: ${JSON.stringify(result)}`);
  }
  await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode?.(nodeId), result.node_id);
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.()))
    .toBe(result.node_id);
  await expect(desktopWindow.locator('[data-testid="pdf-document-page-shell"][data-pdf-page-state="ready"]').first()).toBeVisible();
  return result.node_id;
}

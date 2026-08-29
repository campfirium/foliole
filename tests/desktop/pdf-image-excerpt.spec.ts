import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const FIXTURE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/pdf-user-journey.pdf');
const SCREENSHOT_PATH = path.resolve('.tmp/artifacts/pdf-image-excerpt-text-visible.png');

function pdfObject(number: number, body: Buffer | string) {
  return Buffer.concat([Buffer.from(`${number} 0 obj\n`), Buffer.from(body), Buffer.from('\nendobj\n')]);
}

function createVisualPdfFixture(filePath: string, text: string | null) {
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

async function importPdf(desktopApp: ElectronApplication, desktopWindow: Page, fixturePath = FIXTURE_PATH) {
  await desktopApp.evaluate(({ dialog }, fixturePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixturePath] });
  }, fixturePath);
  const result = await desktopWindow.evaluate(() => window.electronAPI?.invoke('run_text_file_import', {}));
  if (!result || typeof result !== 'object' || typeof result.node_id !== 'string') {
    throw new Error(`PDF import failed: ${JSON.stringify(result)}`);
  }
  await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode?.(nodeId), result.node_id);
  await desktopWindow.locator(`[role="treeitem"][data-node-id="${result.node_id}"]`).click();
  await expect(desktopWindow.locator('[data-testid="pdf-document-page-shell"][data-pdf-page-state="ready"]').first()).toBeVisible();
  return result.node_id;
}

async function dragExcerptRegion(desktopWindow: Page) {
  await desktopWindow.getByRole('button', { name: /Image excerpt|图片摘录/ }).click();
  const selectionLayer = desktopWindow.getByTestId('pdf-image-excerpt-selection-layer').first();
  const bounds = await selectionLayer.boundingBox();
  if (!bounds) throw new Error('PDF image excerpt selection layer has no bounds');
  await desktopWindow.mouse.move(bounds.x + bounds.width * 0.2, bounds.y + bounds.height * 0.2);
  await desktopWindow.mouse.down();
  await desktopWindow.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + bounds.height * 0.65);
  await desktopWindow.mouse.up();
  await desktopWindow.getByRole('button', { name: /Create image excerpt|创建图片摘录/ }).click();
}

test('PDF image excerpt @pdf creates a normal image and opens it from the source outline', async ({
  desktopApp,
  desktopWindow
}) => {
  const parentNodeId = await importPdf(desktopApp, desktopWindow);
  await dragExcerptRegion(desktopWindow);
  const excerptNode = desktopWindow.getByRole('treeitem', { name: /Image excerpt · Page 1/ });
  await expect(excerptNode).toBeVisible();
  const excerptNodeId = await excerptNode.getAttribute('data-node-id');
  if (!excerptNodeId) throw new Error('PDF image excerpt node has no id');
  const outline = desktopWindow.getByRole('button', { name: /Image excerpt: Image excerpt · Page 1/ }).first();
  await expect(outline).toBeVisible();
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await outline.click();
  await expect.poll(() => desktopWindow.evaluate(() => {
    const debug = window.__folioleWorkspaceDebug;
    const activeNodeId = debug?.getActiveNodeId?.() ?? null;
    return activeNodeId ? debug?.getNode?.(activeNodeId)?.anchorKind ?? null : null;
  })).toBe('image-excerpt');
  await expect(desktopWindow.locator('img[src^="foliole-asset://attachment/"]').first()).toBeVisible();
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
  const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
  await expect(palette).toBeVisible();
  await palette.locator('button[aria-label="Go to Parent"], button[aria-label="返回上级"]').click();
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.()))
    .toBe(parentNodeId);
  await expect(desktopWindow.getByTestId('pdf-image-excerpt-outline').first()).toBeVisible();
  await desktopWindow.reload();
  await expect.poll(() => desktopWindow.evaluate((nodeId) => (
    window.__folioleWorkspaceDebug?.getNode?.(nodeId)?.anchorKind ?? null
  ), excerptNodeId)).toBe('image-excerpt');
  await desktopWindow.locator(`[role="treeitem"][data-node-id="${parentNodeId}"]`).click();
  await expect(desktopWindow.locator('[data-testid="pdf-document-page-shell"][data-pdf-page-state="ready"]').first()).toBeVisible();
  const restoredOutline = desktopWindow.getByTestId('pdf-image-excerpt-outline').first();
  await expect(restoredOutline).toBeVisible();
  await restoredOutline.getByRole('button').first().click();
  await expect(desktopWindow.locator('img[src^="foliole-asset://attachment/"]').first()).toBeVisible();
});

for (const scenario of [
  { name: 'mixed', text: 'Mixed PDF text layer' },
  { name: 'scanned', text: null }
]) {
  test(`PDF image excerpt @pdf creates a full-page excerpt from ${scenario.name} pages`, async ({
    desktopApp,
    desktopWindow
  }) => {
    const fixturePath = path.resolve(`.tmp/artifacts/pdf-image-excerpt-${scenario.name}.pdf`);
    createVisualPdfFixture(fixturePath, scenario.text);
    await importPdf(desktopApp, desktopWindow, fixturePath);
    await desktopWindow.getByRole('button', { name: /Image excerpt|图片摘录/ }).click();
    await desktopWindow.getByRole('button', { name: /Select full page|选择整页/ }).click();
    await desktopWindow.getByRole('button', { name: /Create image excerpt|创建图片摘录/ }).click();
    await expect(desktopWindow.getByRole('treeitem', { name: /Image excerpt · Page 1/ })).toBeVisible();
    await expect(desktopWindow.getByTestId('pdf-image-excerpt-outline').first()).toBeVisible();
    await desktopWindow.screenshot({ path: path.resolve(`.tmp/artifacts/pdf-image-excerpt-${scenario.name}-visible.png`) });
  });
}

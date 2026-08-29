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

async function dragExcerptRegion(desktopWindow: Page, area = { endX: 0.7, endY: 0.75, startX: 0.2, startY: 0.35 }) {
  const page = desktopWindow.locator('.pdf-visual-excerpt-page').first();
  const bounds = await page.boundingBox();
  if (!bounds) throw new Error('PDF page has no bounds');
  await desktopWindow.mouse.move(bounds.x + bounds.width * area.startX, bounds.y + bounds.height * area.startY);
  await desktopWindow.mouse.down();
  await desktopWindow.mouse.move(bounds.x + bounds.width * area.endX, bounds.y + bounds.height * area.endY);
  await desktopWindow.mouse.up();
}

async function selectExcerptOutline(desktopWindow: Page, nodeId?: string) {
  const outline = nodeId
    ? desktopWindow.locator(`[data-pdf-image-excerpt-node-id="${nodeId}"]`).first()
    : desktopWindow.getByTestId('pdf-image-excerpt-outline').first();
  const bounds = await outline.boundingBox();
  if (!bounds) throw new Error('PDF image excerpt outline has no bounds');
  await desktopWindow.mouse.click(bounds.x + 1, bounds.y + bounds.height / 2);
  await expect(desktopWindow.getByTestId('pdf-image-excerpt-outline-toolbar')).toBeVisible();
}

test('PDF image excerpt @pdf creates a normal image and opens it from the source outline', async ({
  desktopApp,
  desktopWindow
}) => {
  const fixturePath = path.resolve('.tmp/artifacts/pdf-image-excerpt-sequential.pdf');
  createVisualPdfFixture(fixturePath, null);
  const parentNodeId = await importPdf(desktopApp, desktopWindow, fixturePath);
  await dragExcerptRegion(desktopWindow);
  const excerptNode = desktopWindow.getByRole('treeitem', { name: /Excerpt 1/ });
  await expect(excerptNode).toBeVisible();
  const excerptNodeId = await excerptNode.getAttribute('data-node-id');
  if (!excerptNodeId) throw new Error('PDF image excerpt node has no id');
  await expect(desktopWindow.getByTestId('pdf-image-excerpt-outline').first()).toBeVisible();
  await dragExcerptRegion(desktopWindow, { endX: 0.92, endY: 0.7, startX: 0.76, startY: 0.45 });
  await expect(desktopWindow.getByRole('treeitem', { name: /Excerpt 2/ })).toBeVisible();
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
  await expect(desktopWindow.getByRole('treeitem', { name: /Excerpt 2/ })).toHaveCount(0);
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+Z' : 'Control+Shift+Z');
  await expect(desktopWindow.getByRole('treeitem', { name: /Excerpt 2/ })).toBeVisible();
  await desktopWindow.screenshot({ path: SCREENSHOT_PATH });
  await selectExcerptOutline(desktopWindow, excerptNodeId);
  await desktopWindow.getByRole('button', { name: /Open excerpt|进入摘录/ }).click();
  await expect.poll(() => desktopWindow.evaluate(() => {
    const debug = window.__folioleWorkspaceDebug;
    const activeNodeId = debug?.getActiveNodeId?.() ?? null;
    return activeNodeId ? debug?.getNode?.(activeNodeId)?.anchorKind ?? null : null;
  })).toBe('image-excerpt');
  await expect(desktopWindow.locator('img[src^="foliole-asset://attachment/"]').first()).toBeVisible();
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
  const palette = desktopWindow.getByRole('dialog', { name: /Command palette|命令面板/ });
  await expect(palette).toBeVisible();
  await palette.locator('button[aria-label="Go Up"], button[aria-label="返回上级"]').click();
  await expect.poll(() => desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.()))
    .toBe(parentNodeId);
  await expect(desktopWindow.getByTestId('pdf-image-excerpt-outline').first()).toBeVisible();
  await desktopWindow.reload();
  await expect.poll(() => desktopWindow.evaluate((nodeId) => (
    window.__folioleWorkspaceDebug?.getNode?.(nodeId)?.anchorKind ?? null
  ), excerptNodeId)).toBe('image-excerpt');
  await desktopWindow.locator(`[role="treeitem"][data-node-id="${parentNodeId}"]`).click();
  await expect(desktopWindow.locator('[data-testid="pdf-document-page-shell"][data-pdf-page-state="ready"]').first()).toBeVisible();
  const restoredOutline = desktopWindow.locator(`[data-pdf-image-excerpt-node-id="${excerptNodeId}"]`).first();
  await expect(restoredOutline).toBeVisible();
  await selectExcerptOutline(desktopWindow, excerptNodeId);
  await desktopWindow.getByRole('button', { name: /Delete excerpt|删除摘录/ }).click();
  await expect(restoredOutline).toHaveCount(0);
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+Z' : 'Control+Z');
  await expect(restoredOutline).toBeVisible();
});

for (const scenario of [
  { name: 'mixed', text: 'Mixed PDF text layer' },
  { name: 'scanned', text: null }
]) {
  test(`PDF image excerpt @pdf routes text and visual drags on ${scenario.name} pages`, async ({
    desktopApp,
    desktopWindow
  }) => {
    const fixturePath = path.resolve(`.tmp/artifacts/pdf-image-excerpt-${scenario.name}.pdf`);
    createVisualPdfFixture(fixturePath, scenario.text);
    await importPdf(desktopApp, desktopWindow, fixturePath);
    await expect(desktopWindow.getByRole('button', { name: /Select full page|选择整页/ })).toHaveCount(0);
    const hint = desktopWindow.getByRole('img', { name: /Excerpt|摘录/ });
    await expect(hint).toBeVisible();
    await hint.hover();
    await expect(desktopWindow.getByRole('tooltip')).toContainText(
      scenario.text ? /Drag over text|在文字上拖动/ : /Drag elsewhere|页面其他位置拖动/
    );
    if (scenario.text) {
      const text = desktopWindow.locator('.textLayer span:not(.endOfContent)').first();
      await expect(text).toHaveCSS('cursor', 'text');
    }
    await expect(desktopWindow.locator('.pdf-visual-excerpt-page').first()).toHaveCSS('cursor', 'crosshair');
    await dragExcerptRegion(desktopWindow);
    await expect(desktopWindow.getByRole('treeitem', { name: /Excerpt 1/ })).toBeVisible();
    await expect(desktopWindow.getByTestId('pdf-image-excerpt-outline').first()).toBeVisible();
    await desktopWindow.screenshot({ path: path.resolve(`.tmp/artifacts/pdf-image-excerpt-${scenario.name}-visible.png`) });
  });
}

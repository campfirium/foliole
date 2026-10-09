import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import type { PdfReadingView, PdfViewRect } from '../../src/features/pdf/model/pdfReadingView';

import { expect, test } from './harness/fixtures';

test('PDF automatic and manual views preserve ranges across reload @pdf', async ({
  desktopApp,
  desktopWindow
}) => {
  await seedObsoleteRange(desktopWindow);
  await openPdf(desktopApp, desktopWindow);
  const surface = desktopWindow.getByTestId('pdf-document-surface');
  const reveal = () => surface.getByTestId('pdf-toolbar-reveal-zone').hover();
  const automatic = surface.getByRole('button', { name: /^(Automatic view|自动视图)$/ });
  const manual = surface.getByRole('button', { name: /^(Manual view|手动视图)$/ });
  const readView = () => readSavedView(desktopWindow);
  await expect(automatic).toBeEnabled({ timeout: 45000 });
  await expect(automatic).toHaveAttribute('aria-pressed', 'true');
  const autoRecord = await readView();
  expect(autoRecord).toMatchObject({ mode: 'auto', manual: null, automatic: expect.any(Object) });
  await verifyAutomaticView(desktopWindow, autoRecord);
  await reveal();
  await manual.click();
  const dialog = desktopWindow.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const canvas = dialog.locator('canvas');
  await expect(canvas).toBeVisible();
  await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
  expect(await readView()).toEqual(autoRecord);
  await reveal();
  await manual.click();
  await selectManualRange(desktopWindow);
  await expect(dialog).toBeHidden();
  await expect(manual).toHaveAttribute('aria-pressed', 'true');
  const manualRecord = await readView();
  expect(manualRecord).toMatchObject({
    mode: 'manual',
    manual: { x: expect.any(Number), y: expect.any(Number) }
  });
  await assertHeightFit(desktopWindow, manualRecord?.manual);
  await verifyViewPaging(desktopWindow, manualRecord?.manual);
  await surface.screenshot({ path: path.resolve('.tmp/artifacts/pdf-view-manual-native.png') });
  await reveal();
  await automatic.click();
  await expect(automatic).toHaveAttribute('aria-pressed', 'true');
  await reveal();
  await manual.click();
  await expect(dialog).toBeHidden();
  await expect(manual).toHaveAttribute('aria-pressed', 'true');
  await desktopWindow.reload();
  await expect(manual).toHaveAttribute('aria-pressed', 'true', { timeout: 45000 });
  expect(await readView()).toEqual(manualRecord);
  await reveal();
  await surface.getByRole('button', { name: /^(Manual view options|手动视图选项)$/ }).click();
  await desktopWindow.getByRole('menuitem', { name: /^(Adjust range|调整范围)$/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.screenshot({ path: path.resolve('.tmp/artifacts/pdf-view-editor-native.png') });
  await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
  await reveal();
  await automatic.click();
  await expect(automatic).toHaveAttribute('aria-pressed', 'true');
  await assertHeightFit(desktopWindow, autoRecord?.automatic);
  await surface.screenshot({ path: path.resolve('.tmp/artifacts/pdf-view-automatic-native.png') });
  await verifyFreeZoom(desktopWindow, autoRecord, manualRecord);
});

async function verifyFreeZoom(desktopWindow: Page, autoRecord: PdfReadingView | null,
  manualRecord: PdfReadingView | null) {
  const surface = desktopWindow.getByTestId('pdf-document-surface');
  const reveal = () => surface.getByTestId('pdf-toolbar-reveal-zone').hover();
  const automatic = surface.getByRole('button', { name: /^(Automatic view|自动视图)$/ });
  const manual = surface.getByRole('button', { name: /^(Manual view|手动视图)$/ });
  const scroller = surface.getByTestId('pdf-scroll-container');
  await scroller.evaluate((element) => { element.scrollTop += 80; });
  const scrolled = await scroller.evaluate((element) => element.scrollTop);
  await reveal();
  expect(await scroller.evaluate((element) => element.scrollTop)).toBe(scrolled);
  await surface.getByRole('button', { name: /^(Set zoom level|设置缩放级别)$/ }).click();
  await surface.getByRole('menuitem', { name: '125%', exact: true }).click();
  await expect.poll(async () => (await readSavedView(desktopWindow))?.mode).toBe('free');
  await expect(automatic).toHaveAttribute('aria-pressed', 'false');
  await expect(manual).toHaveAttribute('aria-pressed', 'false');
  await desktopWindow.reload();
  await expect(surface.getByTestId('pdf-zoom-value')).toHaveText('125%', { timeout: 45000 });
  expect(await readSavedView(desktopWindow)).toMatchObject({ mode: 'free', automatic: autoRecord?.automatic, manual: manualRecord?.manual });
}

async function openPdf(desktopApp: ElectronApplication, desktopWindow: Page) {
  await desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ }).click();
  const fixture =
    process.env.FOLIOLE_PDF_VIEW_FIXTURE ??
    path.resolve('tests/desktop/fixtures/pdf-user-journey.pdf');
  await desktopApp.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
  }, fixture);
  const nodeId = await desktopWindow.evaluate(async () => {
    const result = await window.electronAPI?.invoke('run_text_file_import', {});
    if (
      !result ||
      typeof result !== 'object' ||
      !('node_id' in result) ||
      typeof result.node_id !== 'string'
    ) {
      throw new Error('PDF import failed.');
    }
    return result.node_id;
  });
  await expect
    .poll(() =>
      desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug?.getNode?.(id)?.id, nodeId)
    )
    .toBe(nodeId);
  await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), nodeId);
}

async function selectManualRange(desktopWindow: Page) {
  const dialog = desktopWindow.getByRole('dialog');
  const selection = dialog.getByTestId('pdf-view-range-selection');
  const bounds = await selection.boundingBox();
  const corner = await selection.locator('[data-handle="se"]').boundingBox();
  const automatic = (await readSavedView(desktopWindow))?.automatic;
  if (!bounds || !corner || !automatic) throw new Error('Range editor is unavailable.');
  await desktopWindow.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2);
  await desktopWindow.mouse.down();
  await desktopWindow.mouse.move(bounds.x + bounds.width * (automatic.x + automatic.width) + 2,
    bounds.y + bounds.height * (automatic.y + automatic.height) + 2, { steps: 8 });
  await expect(selection.getByTestId('pdf-range-snap-vertical')).toBeVisible();
  await dialog.screenshot({ path: path.resolve('.tmp/artifacts/pdf-view-snap-native.png') });
  await desktopWindow.mouse.up();
  await dialog.getByRole('button', { name: /^(Confirm|确认)$/ }).click();
}

async function assertHeightFit(page: Page, rect: PdfViewRect | null | undefined, number = 1) {
  if (!rect) throw new Error('PDF view range is missing.');
  const shell = page.locator(`[data-pdf-page-number="${number}"]`);
  await expect.poll(async () => {
    const frame = await shell.getByTestId('pdf-document-page-frame').boundingBox();
    const canvas = await shell.locator('.react-pdf__Page canvas').boundingBox();
    const viewport = await page.getByTestId('pdf-scroll-container').boundingBox();
    const height = await page.getByTestId('pdf-scroll-container').evaluate((element) => element.clientHeight);
    if (!frame || !canvas || !viewport || canvas.height === 0) return false;
    return Math.abs(frame.width - canvas.width) < 2 &&
      Math.abs(frame.height - canvas.height) < 2 &&
      Math.abs(canvas.height * rect.height - (height - 16)) < 3 &&
      Math.abs(canvas.y + canvas.height * rect.y - viewport.y - 8) < 3;
  }).toBe(true);
  await expect(shell.locator('.pdf-document-page-crop-content')).toHaveCount(0);
}

async function readSavedView(page: Page) {
  return page.evaluate(async () => {
    const settings = await window.electronAPI?.invoke('load_app_settings_state', {});
    const raw = settings?.['foliole-pdf-document-views'];
    if (typeof raw !== 'string') return null;
    return Object.values(JSON.parse(raw) as Record<string, PdfReadingView>)[0] ?? null;
  });
}

async function seedObsoleteRange(page: Page) {
  const file = process.env.FOLIOLE_PDF_VIEW_FIXTURE ?? path.resolve('tests/desktop/fixtures/pdf-user-journey.pdf');
  const pdf = await getDocument({ data: new Uint8Array(await readFile(file)) }).promise;
  const fingerprint = pdf.fingerprints[0];
  await pdf.destroy();
  if (!fingerprint) throw new Error('PDF fingerprint is missing.');
  await page.evaluate(async (id) => {
    const settings = await window.electronAPI?.invoke('load_app_settings_state', {});
    if (!settings) throw new Error('Settings are unavailable.');
    await window.electronAPI?.invoke('save_app_settings_state', { settings: { ...settings,
      'foliole-pdf-document-views': JSON.stringify({ [id]: {
        mode: 'auto', automatic: { x: 0, y: 0, width: 1, height: 1 }, manual: null
      } }) } });
  }, fingerprint);
}
async function verifyViewPaging(page: Page, rect: PdfViewRect | null | undefined) {
  const surface = page.getByTestId('pdf-document-surface');
  const scroller = surface.getByTestId('pdf-scroll-container');
  await scroller.evaluate((element) => { element.scrollTop += 65; });
  await scroller.click({ position: { x: 30, y: 250 } });
  await page.keyboard.press('Space');
  await assertHeightFit(page, rect, 2);
  await page.keyboard.press('Shift+Space');
  await assertHeightFit(page, rect, 1);
  await surface.getByTestId('pdf-toolbar-reveal-zone').hover();
  await surface.getByRole('button', { name: /^(Next page|下一页)$/ }).click();
  await assertHeightFit(page, rect, 2);
  await surface.getByTestId('pdf-toolbar-reveal-zone').hover();
  await surface.getByRole('button', { name: /^(Previous page|上一页)$/ }).click();
  await assertHeightFit(page, rect, 1);
}

async function verifyAutomaticView(page: Page, record: PdfReadingView | null) {
  expect(record?.automaticVersion).toBe(1);
  if (process.env.FOLIOLE_PDF_VIEW_FIXTURE?.includes('deep-residual-learning')) {
    expect((record?.automatic?.y ?? 1) + (record?.automatic?.height ?? 1)).toBeLessThan(.915);
  }
  await assertHeightFit(page, record?.automatic);
  await verifyViewPaging(page, record?.automatic);
}

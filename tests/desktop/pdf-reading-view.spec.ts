import path from 'node:path';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

test('PDF automatic and manual views preserve ranges across reload @pdf', async ({
  desktopApp,
  desktopWindow
}) => {
  await openPdf(desktopApp, desktopWindow);
  const surface = desktopWindow.getByTestId('pdf-document-surface');
  const reveal = () => surface.getByTestId('pdf-toolbar-reveal-zone').hover();
  const automatic = surface.getByRole('button', { name: /^(Automatic view|自动视图)$/ });
  const manual = surface.getByRole('button', { name: /^(Manual view|手动视图)$/ });
  const readView = () =>
    desktopWindow.evaluate(async () => {
      const settings = await window.electronAPI?.invoke('load_app_settings_state', {});
      const raw = settings?.['foliole-pdf-document-views'];
      if (typeof raw !== 'string') return null;
      return Object.values(JSON.parse(raw))[0];
    });
  await expect(automatic).toBeEnabled({ timeout: 45000 });
  await expect(automatic).toHaveAttribute('aria-pressed', 'true');
  const autoRecord = await readView();
  expect(autoRecord).toMatchObject({ mode: 'auto', manual: null, automatic: expect.any(Object) });
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
  await surface.getByRole('button', { name: /^(Adjust range|调整范围)$/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.screenshot({ path: path.resolve('.tmp/artifacts/pdf-view-editor-native.png') });
  await dialog.getByRole('button', { name: /^(Cancel|取消)$/ }).click();
  await reveal();
  await automatic.click();
  await expect(automatic).toHaveAttribute('aria-pressed', 'true');
  await surface.screenshot({ path: path.resolve('.tmp/artifacts/pdf-view-automatic-native.png') });
});

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
  if (!bounds) throw new Error('Range editor is unavailable.');
  await desktopWindow.mouse.move(bounds.x + bounds.width * 0.1, bounds.y + bounds.height * 0.12);
  await desktopWindow.mouse.down();
  await desktopWindow.mouse.move(bounds.x + bounds.width * 0.9, bounds.y + bounds.height * 0.88, {
    steps: 8
  });
  await desktopWindow.mouse.up();
  await dialog.getByRole('button', { name: /^(Confirm|确认)$/ }).click();
}

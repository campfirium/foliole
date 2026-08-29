import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';

const FIXTURE_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/pdf-user-journey.pdf');

async function importPdf(desktopApp: ElectronApplication, desktopWindow: Page) {
  await desktopApp.evaluate(({ dialog }, fixturePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixturePath] });
  }, FIXTURE_PATH);
  const result = await desktopWindow.evaluate(() => window.electronAPI?.invoke('run_text_file_import', {}));
  if (!result || typeof result !== 'object' || typeof result.node_id !== 'string') {
    throw new Error(`PDF import failed: ${JSON.stringify(result)}`);
  }
  await desktopWindow.evaluate((nodeId) => window.__folioleWorkspaceDebug?.openNode?.(nodeId), result.node_id);
  await desktopWindow.locator(`[role="treeitem"][data-node-id="${result.node_id}"]`).click();
  await expect(desktopWindow.locator('[data-testid="pdf-document-page-shell"][data-pdf-page-state="ready"]').first()).toBeVisible();
  return result.node_id;
}

test('focused PDF Ctrl+M opens priority quick set and persists the chosen value', async ({
  desktopApp,
  desktopWindow
}) => {
  const nodeId = await importPdf(desktopApp, desktopWindow);
  const pdfCanvas = desktopWindow
    .locator('[data-testid="pdf-document-page-shell"][data-pdf-page-state="ready"] canvas')
    .first();

  await pdfCanvas.click({ force: true, position: { x: 40, y: 40 } });
  await desktopWindow.keyboard.press('Control+M');
  await expect(desktopWindow.getByRole('dialog', { name: /Set priority|设置优先级/ })).toBeVisible();
  await desktopWindow.keyboard.press('7');
  await expect(desktopWindow.getByRole('button', { name: /Priority P7 set on this node|优先级 P7/ })).toBeVisible();

  await desktopWindow.reload();
  await desktopWindow.locator(`[role="treeitem"][data-node-id="${nodeId}"]`).click();
  await expect(desktopWindow.getByRole('button', { name: /Priority P7 set on this node|优先级 P7/ })).toBeVisible();
});

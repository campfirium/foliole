import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from './harness/fixtures';

const fixturePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/pdf-user-journey.pdf');

test('a PDF reader exports the linked file with its original name', async ({ desktopApp, desktopWindow }) => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), 'foliole-pdf-export-'));
  const outputPath = path.join(outputDir, 'pdf-user-journey.pdf');
  try {
    await desktopApp.evaluate(({ dialog }, inputPath) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [inputPath] });
    }, fixturePath);
    const imported = await desktopWindow.evaluate(() => window.electronAPI?.invoke('run_text_file_import', {}));
    if (!imported || typeof imported !== 'object' || typeof imported.node_id !== 'string') {
      throw new Error('PDF import did not create a topic');
    }
    await expect.poll(() => desktopWindow.evaluate((id) =>
      window.__folioleWorkspaceDebug?.getNode?.(id)?.id ?? null, imported.node_id
    )).toBe(imported.node_id);
    await desktopWindow.evaluate((id) => window.__folioleWorkspaceDebug?.openNode?.(id), imported.node_id);
    const topicRow = desktopWindow.locator(`[role="treeitem"][data-node-id="${imported.node_id}"]`);
    await topicRow.click();
    const reader = desktopWindow.getByRole('region', { name: /PDF reader panel|PDF 阅读器面板/ });
    await expect(reader).toBeVisible();
    await expect(reader.getByRole('button', { name: /Export PDF|导出 PDF/ })).toHaveCount(0);
    await topicRow.click({ button: 'right' });
    const exportAction = desktopWindow.getByRole('menuitem', { name: /Export PDF|导出 PDF/ });
    await expect(exportAction).toBeVisible();
    await desktopWindow.screenshot({ path: path.resolve('.tmp/artifacts/pdf-export-menu-hidden-native.png') });

    await desktopApp.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
    }, outputPath);
    await exportAction.click();
    await expect.poll(async () => fs.readFile(outputPath).catch(() => null)).not.toBeNull();
    expect(await fs.readFile(outputPath)).toEqual(await fs.readFile(fixturePath));
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
});

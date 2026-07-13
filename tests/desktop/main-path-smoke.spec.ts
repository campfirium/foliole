import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell, openSettingsCategory } from './harness/settings';

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/main-path-smoke.md'
);
const IMPORTED_TITLE = 'Main Path Smoke Article';
const READING_LINE = 'The reading smoke line should remain visible after the imported node opens.';
const WORKSPACE_NAME = /^(Foliole workspace|Foliole 工作区)$/;

async function installImportFixtureSelection(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ dialog }, fixturePath) => {
    const target = globalThis as typeof globalThis & {
      __folioleMainPathSmokeOriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    if (!target.__folioleMainPathSmokeOriginalShowOpenDialog) {
      target.__folioleMainPathSmokeOriginalShowOpenDialog = dialog.showOpenDialog;
    }
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [fixturePath]
    });
  }, FIXTURE_PATH);
}

async function restoreImportFixtureSelection(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ dialog }) => {
    const target = globalThis as typeof globalThis & {
      __folioleMainPathSmokeOriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    if (target.__folioleMainPathSmokeOriginalShowOpenDialog) {
      dialog.showOpenDialog = target.__folioleMainPathSmokeOriginalShowOpenDialog;
      delete target.__folioleMainPathSmokeOriginalShowOpenDialog;
    }
  });
}

async function importFixtureThroughRuntime(desktopApp: ElectronApplication, desktopWindow: Page) {
  await installImportFixtureSelection(desktopApp);
  try {
    const importResult = await desktopWindow.evaluate(async () => {
      return globalThis.window?.electronAPI?.invoke('run_text_file_import', {});
    });
    if (!importResult || typeof importResult !== 'object' || typeof importResult.node_id !== 'string') {
      throw new Error(`main path smoke import did not create a node: ${JSON.stringify(importResult)}`);
    }
    return importResult.node_id;
  } finally {
    await restoreImportFixtureSelection(desktopApp);
  }
}

async function reloadWorkspace(desktopWindow: Page) {
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
}

async function openImportedNode(desktopWindow: Page) {
  await desktopWindow.getByRole('treeitem', { name: IMPORTED_TITLE, exact: true }).click();
}

async function collectImportedNode(desktopWindow: Page, nodeId: string) {
  return desktopWindow.evaluate(async (targetNodeId) => {
    const snapshot = await globalThis.window?.electronAPI?.invoke('load_workspace_snapshot', {});
    const importedNode = snapshot?.nodesById?.[targetNodeId] ?? null;
    const document = await globalThis.window?.electronAPI?.invoke('load_node_document', { nodeId: targetNodeId });
    return importedNode
      ? {
          content: typeof document?.content === 'string' ? document.content : '',
          title: typeof importedNode.title === 'string' ? importedNode.title : ''
        }
      : null;
  }, nodeId);
}

test('desktop main path smoke covers import, reading, review entry, and sync settings boundary', async ({
  desktopApp,
  desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);

  const importedNodeId = await importFixtureThroughRuntime(desktopApp, desktopWindow);
  await reloadWorkspace(desktopWindow);

  const importedNode = await collectImportedNode(desktopWindow, importedNodeId);
  expect(importedNode).toMatchObject({
    content: expect.stringContaining(READING_LINE),
    title: IMPORTED_TITLE
  });

  await openImportedNode(desktopWindow);
  await expect(desktopWindow.getByRole('button', { name: IMPORTED_TITLE, exact: true })).toBeVisible();
  await expect(desktopWindow.getByRole('main', { name: WORKSPACE_NAME })).toContainText(READING_LINE);

  await desktopWindow.getByRole('button', { name: /^(Enter Flow|进入 Flow)$/ }).click();
  await expect(desktopWindow.getByRole('group', { name: 'Flow toolbar' })).toBeVisible();
  await desktopWindow.getByRole('button', { name: IMPORTED_TITLE, exact: true }).click();
  await expect(desktopWindow.getByRole('main', { name: WORKSPACE_NAME })).toContainText(IMPORTED_TITLE);

  const settingsDialog = await openSettingsCategory(desktopWindow, 'Sync');
  await expect(settingsDialog.getByRole('heading', { level: 3, name: /^(Sync|同步)$/ })).toBeVisible();
  await expect(settingsDialog.getByRole('switch', { name: /^(Enable desktop sync|启用桌面同步)$/ })).toBeVisible();
  await expect(settingsDialog.getByText(/^(Device role|设备角色)$/)).toBeVisible();
  await expect(settingsDialog.getByText(/^(Connected devices|已连接设备)$/)).toBeVisible();
});

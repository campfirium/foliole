import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FIXTURE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'fixtures/main-path-smoke.md'
);
const READING_LINE = 'The reading smoke line should remain visible after the imported node opens.';

async function installImportFixtureSelection(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(({ dialog }, fixturePath) => {
    const target = globalThis as typeof globalThis & {
      __folioleImmersiveF11OriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    if (!target.__folioleImmersiveF11OriginalShowOpenDialog) {
      target.__folioleImmersiveF11OriginalShowOpenDialog = dialog.showOpenDialog;
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
      __folioleImmersiveF11OriginalShowOpenDialog?: typeof dialog.showOpenDialog;
    };
    if (target.__folioleImmersiveF11OriginalShowOpenDialog) {
      dialog.showOpenDialog = target.__folioleImmersiveF11OriginalShowOpenDialog;
      delete target.__folioleImmersiveF11OriginalShowOpenDialog;
    }
  });
}

async function importFixture(desktopApp: ElectronApplication, desktopWindow: Page) {
  await installImportFixtureSelection(desktopApp);
  try {
    const result = await desktopWindow.evaluate(async () => {
      return globalThis.window?.electronAPI?.invoke('run_text_file_import', {});
    });
    if (!result || typeof result !== 'object' || typeof result.node_id !== 'string') {
      throw new Error(`immersive F11 import did not create a node: ${JSON.stringify(result)}`);
    }
    return result.node_id;
  } finally {
    await restoreImportFixtureSelection(desktopApp);
  }
}

async function openImportedNode(desktopWindow: Page, nodeId: string) {
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  const opened = await desktopWindow.evaluate(async (targetNodeId) => {
    return globalThis.window?.__folioleWorkspaceDebug?.openNode?.(targetNodeId) ?? false;
  }, nodeId);
  expect(opened).toBe(true);
}

test('keeps F11 as immersive reading in the desktop host', async ({
  desktopApp,
  desktopWindow
}) => {
  await expectWorkspaceShell(desktopWindow);

  const importedNodeId = await importFixture(desktopApp, desktopWindow);
  await openImportedNode(desktopWindow, importedNodeId);

  await expect(desktopWindow.locator('.prompt-editor-host')).toContainText(READING_LINE);

  await desktopWindow.keyboard.press('F11');
  await desktopWindow.locator('.prompt-editor-host .cm-scroller').waitFor({ state: 'visible' });
  await expect(desktopWindow.locator('.prompt-editor-host')).toContainText(READING_LINE);
  await expect(desktopWindow.getByLabel('Window controls')).toHaveCount(0);
});

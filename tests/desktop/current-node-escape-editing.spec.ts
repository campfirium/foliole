import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const NODE_ID = 'playwright-current-node-escape-topic';

async function seedCurrentNodeWorkspace(desktopWindow: Page) {
  await desktopWindow.evaluate(async (nodeId) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: 'Alpha\nBeta\nGamma',
        id: nodeId,
        kind: 'topic',
        title: 'Playwright Current Node Escape Topic'
      }
    ]);
    await api?.openNode?.(nodeId);
  }, NODE_ID);
}

async function focusPromptEditor(desktopWindow: Page) {
  const focused = await desktopWindow.evaluate(() => globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', 2, 2) ?? false);
  expect(focused).toBe(true);
}

async function sendNativeEscape(desktopApp: ElectronApplication) {
  await desktopApp.evaluate(async ({ BrowserWindow }) => {
    const target = BrowserWindow.getAllWindows()[0];
    if (!target) throw new Error('missing browser window');
    target.focus();
    target.webContents.focus();
    target.webContents.sendInputEvent({ keyCode: 'Escape', type: 'keyDown' });
    target.webContents.sendInputEvent({ keyCode: 'Escape', type: 'keyUp' });
  });
}

async function getNodeSnapshot(desktopWindow: Page) {
  return desktopWindow.evaluate((nodeId) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    return api?.getNode?.(nodeId) ?? null;
  }, NODE_ID);
}

test('Escape leaves current node editing after command palette closes outside Flow', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedCurrentNodeWorkspace(desktopWindow);
  await focusPromptEditor(desktopWindow);

  await desktopWindow.keyboard.press('Control+P');
  await expect(desktopWindow.getByRole('textbox', { name: 'Search commands' })).toBeVisible();
  await desktopWindow.keyboard.press('Escape');
  await expect(desktopWindow.getByRole('textbox', { name: 'Search commands' })).toBeHidden();

  await desktopWindow.keyboard.press('Delete');
  await expect.poll(() => getNodeSnapshot(desktopWindow)).toMatchObject({ trashed: false });

  await sendNativeEscape(desktopApp);
  await desktopWindow.keyboard.press('Delete');

  await expect.poll(() => getNodeSnapshot(desktopWindow), {
    message: 'waiting for Delete to work after native Escape leaves editing'
  }).toMatchObject({ trashed: true });
});

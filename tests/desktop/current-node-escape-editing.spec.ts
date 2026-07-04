import type { ElectronApplication, Page } from '@playwright/test';

import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

async function seedCurrentNodeWorkspace(desktopWindow: Page, nodeId: string) {
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
  }, nodeId);
}

async function focusPromptEditor(desktopWindow: Page) {
  await expect
    .poll(() => desktopWindow.evaluate(() => globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', 2, 2) ?? false))
    .toBe(true);
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

async function getNodeSnapshot(desktopWindow: Page, nodeId: string) {
  return desktopWindow.evaluate((nodeId) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    return api?.getNode?.(nodeId) ?? null;
  }, nodeId);
}

test('Escape leaves current node editing after command palette closes outside Flow', async ({ desktopApp, desktopWindow }) => {
  const nodeId = 'playwright-current-node-escape-topic';
  await expectWorkspaceShell(desktopWindow);
  await seedCurrentNodeWorkspace(desktopWindow, nodeId);
  await focusPromptEditor(desktopWindow);

  await desktopWindow.keyboard.press('Control+P');
  await expect(desktopWindow.getByRole('textbox', { name: /Search commands|搜索命令/ })).toBeVisible();
  await desktopWindow.keyboard.press('Escape');
  await expect(desktopWindow.getByRole('textbox', { name: /Search commands|搜索命令/ })).toBeHidden();

  await desktopWindow.keyboard.press('Delete');
  await expect.poll(() => getNodeSnapshot(desktopWindow, nodeId)).toMatchObject({ trashed: false });

  await sendNativeEscape(desktopApp);
  await desktopWindow.keyboard.press('Delete');

  await expect.poll(() => getNodeSnapshot(desktopWindow, nodeId), {
    message: 'waiting for Delete to work after native Escape leaves editing'
  }).toMatchObject({ trashed: true });
});

test('Ctrl+M opens priority quick set while editing outside Flow', async ({ desktopWindow }) => {
  const nodeId = 'playwright-current-node-priority-topic';
  await expectWorkspaceShell(desktopWindow);
  await seedCurrentNodeWorkspace(desktopWindow, nodeId);
  await focusPromptEditor(desktopWindow);

  await desktopWindow.keyboard.press('Control+M');

  await expect(desktopWindow.getByRole('dialog', { name: /Set priority|设置优先级/ })).toBeVisible();
});

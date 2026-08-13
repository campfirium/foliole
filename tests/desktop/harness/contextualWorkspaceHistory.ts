import type { ElectronApplication, Page } from '@playwright/test';

import { focusWorkspace, redoShortcut, undoShortcut } from './contextualContentHistory';
import { expect } from './fixtures';

export const STRUCTURE_TARGET_ID = 'playwright-structure-target';

export async function seedStructureWorkspace(page: Page) {
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await page.evaluate(async (targetId) => window.__folioleWorkspaceDebug?.seedNodes?.([
    {
      content: '# Structure base', id: 'playwright-structure-base', kind: 'topic',
      parentNodeId: 'special-inbox', title: 'Structure Base'
    },
    {
      content: '# Structure target', id: targetId, kind: 'topic',
      parentNodeId: 'special-inbox', title: 'Structure Target'
    },
    {
      content: '# Review control',
      id: 'playwright-review-control',
      kind: 'topic',
      parentNodeId: 'special-inbox',
      reading: { nextAt: '2026-08-13T00:00:00.000Z', state: 'queued' },
      title: 'Review Control'
    }
  ]), STRUCTURE_TARGET_ID);
}

export async function createStructureTopic(page: Page) {
  const nodeId = await page.evaluate(() =>
    window.__folioleWorkspaceDebug?.createRootNode?.('# Created structure topic', 'topic') ?? null);
  expect(nodeId).toBeTruthy();
  await expect.poll(() => page.evaluate((id) =>
    window.__folioleWorkspaceDebug?.getNode?.(id)?.trashed ?? null, nodeId!)).toBe(false);
  return nodeId!;
}

export async function clickNativeHistoryCommand(
  app: ElectronApplication,
  page: Page,
  commandId: 'app.redo' | 'app.undo'
) {
  const targetWindow = await app.browserWindow(page);
  const windowId = await targetWindow.evaluate((window) => window.id);
  await app.evaluate(({ BrowserWindow, Menu }, target) => {
    const item = Menu.getApplicationMenu()?.getMenuItemById(target.commandId);
    const window = BrowserWindow.fromId(target.windowId);
    if (!item || !window) throw new Error(`missing native menu command target: ${target.commandId}`);
    item.click(undefined, window, window.webContents);
  }, { commandId, windowId });
}

export async function runPaletteHistoryCommand(page: Page, title: string) {
  await focusWorkspace(page);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
  const dialog = page.getByRole('dialog', { name: /Command palette|命令面板/ });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: /Search commands|搜索命令/ }).fill(title);
  await dialog.getByRole('button', { name: title, exact: true }).click();
  await expect(dialog).toBeHidden();
}

export async function pressWorkspaceHistory(page: Page, mode: 'redo' | 'undo') {
  await focusWorkspace(page);
  await page.keyboard.press(mode === 'undo' ? undoShortcut() : redoShortcut());
}

export async function readStructureHistory(page: Page) {
  return page.evaluate(() => window.__folioleWorkspaceDebug?.getWorkspaceStructureHistory?.() ?? null);
}

export async function readStructureOrder(page: Page) {
  return page.evaluate(() => window.__folioleWorkspaceDebug?.getWorkspaceStructureState?.().nodeOrder ?? []);
}

import type { ElectronApplication, Page } from '@playwright/test';

import { focusWorkspace, redoShortcut, undoShortcut } from './contextualContentHistory';
import { expect } from './fixtures';

export async function seedStructureWorkspace(page: Page) {
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug?.isHydrated?.()));
  const targetId = await page.evaluate(async () => {
    localStorage.setItem('foliole-app-language', 'en');
    const debug = window.__folioleWorkspaceDebug!;
    const target = await debug.createRootNode('# Structure target', 'topic');
    await debug.createRootNode('# Structure base', 'topic');
    return target;
  });
  expect(targetId).toBeTruthy();
  // Reopen the persisted workspace so setup creates are outside the history under test.
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug?.isHydrated?.()));
  return targetId!;
}

export async function readPersistedStructureOrder(page: Page) {
  return page.evaluate(async () => {
    const snapshot = await window.electronAPI.invoke('load_workspace_snapshot', {});
    if (!snapshot) throw new Error('workspace_snapshot_missing');
    return snapshot.nodeOrder.filter((id) => snapshot.nodesById[id]?.parentNodeId === 'special-inbox' &&
      !snapshot.trashedNodeIds.includes(id));
  });
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
  return page.evaluate(() => {
    const debug = window.__folioleWorkspaceDebug!;
    const children: Record<string, string[]> = {};
    for (const id of debug.getWorkspaceStructureState().nodeOrder) {
      const node = debug.getNode(id);
      if (!node) throw new Error(`structure_node_missing: ${id}`);
      const parent = node.parentNodeId ?? '<root>';
      (children[parent] ??= []).push(id);
    }
    return children;
  });
}

export async function exerciseStructureMoveHistory(desktopWindow: Page, createdId: string, targetId: string) {
  const beforeMoveOrder = await readStructureOrder(desktopWindow);
  const beforePersistedOrder = await readPersistedStructureOrder(desktopWindow);
  expect(beforeMoveOrder['special-inbox']).toEqual(beforePersistedOrder);
  expect(await desktopWindow.evaluate(([nodeId, targetId]) =>
    window.__folioleWorkspaceDebug?.moveNodes?.([nodeId!], targetId!, 'before') ?? false,
  [createdId, targetId])).toBe(true);
  await expect.poll(() => readStructureOrder(desktopWindow)).not.toEqual(beforeMoveOrder);
  const movedPersistedOrder = await readPersistedStructureOrder(desktopWindow);
  expect(movedPersistedOrder).not.toEqual(beforePersistedOrder);
  expect(movedPersistedOrder.indexOf(createdId)).toBe(movedPersistedOrder.indexOf(targetId) - 1);
  await runPaletteHistoryCommand(desktopWindow, 'Undo Move Topic');
  await expect.poll(() => readStructureOrder(desktopWindow)).toEqual(beforeMoveOrder);
  expect(await readPersistedStructureOrder(desktopWindow)).toEqual(beforePersistedOrder);
  await runPaletteHistoryCommand(desktopWindow, 'Redo Move Topic');
  await expect.poll(() => readStructureOrder(desktopWindow)).not.toEqual(beforeMoveOrder);

  expect(await readPersistedStructureOrder(desktopWindow)).toEqual(movedPersistedOrder);
  return movedPersistedOrder;
}

import path from 'node:path';

import {
  collectNode, CONTEXT_A_CONTENT, CONTEXT_A_ID, CONTEXT_B_CONTENT, CONTEXT_B_ID,
  focusEditor, insertEditorText, openNode, seedContextualHistoryWorkspace, undoShortcut, WORKSPACE_TARGET_ID
} from './harness/contextualContentHistory';
import { clickNativeHistoryCommand } from './harness/contextualWorkspaceHistory';
import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

for (const recovery of ['notice', 'trash'] as const) {
  test(`preserves A and B edits when recovering C through ${recovery}`, async ({ desktopApp, desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);
    await seedContextualHistoryWorkspace(desktopWindow);
    const exitFlow = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
    if (await exitFlow.isVisible()) await exitFlow.click();
    await expect(exitFlow).toBeHidden();
    await insertEditorText(desktopWindow, ' 1-2');
    await expect.poll(() => collectNode(desktopWindow, CONTEXT_A_ID)).toMatchObject({ content: `${CONTEXT_A_CONTENT} 1-2` });
    await openNode(desktopWindow, CONTEXT_B_ID);
    await insertEditorText(desktopWindow, ' 3-4');
    await expect.poll(() => collectNode(desktopWindow, CONTEXT_B_ID)).toMatchObject({ content: `${CONTEXT_B_CONTENT} 3-4` });
    await desktopWindow.evaluate(async (id) => window.__folioleWorkspaceDebug?.deleteNode?.(id), WORKSPACE_TARGET_ID);
    await expect.poll(() => collectNode(desktopWindow, WORKSPACE_TARGET_ID)).toMatchObject({ trashed: true });
    await openNode(desktopWindow, CONTEXT_A_ID);
    await insertEditorText(desktopWindow, ' 5-6');
    await desktopWindow.keyboard.press(undoShortcut());
    await expect.poll(() => collectNode(desktopWindow, CONTEXT_A_ID)).toMatchObject({ content: `${CONTEXT_A_CONTENT} 1-2` });
    await expect.poll(async () => (await loadNodeDocument(desktopWindow, CONTEXT_B_ID))?.content)
      .toBe(`${CONTEXT_B_CONTENT} 3-4`);
    await expect.poll(() => collectNode(desktopWindow, WORKSPACE_TARGET_ID)).toMatchObject({ trashed: true });
    await clickNativeHistoryCommand(desktopApp, desktopWindow, 'app.redo');
    await expect.poll(() => collectNode(desktopWindow, CONTEXT_A_ID)).toMatchObject({ content: `${CONTEXT_A_CONTENT} 1-2 5-6` });
    if (recovery === 'notice') {
      await desktopWindow.getByRole('button', { name: 'Restore last deleted item' }).click();
    } else {
      await desktopWindow.getByRole('treeitem', { name: /^(Trash|回收站)$/ }).click();
      await desktopWindow.getByRole('treeitem', { name: /^Workspace Target\b/ }).click({ button: 'right' });
      await desktopWindow.getByRole('menuitem', { name: /^(Restore|恢复)$/ }).click();
    }
    await expect.poll(() => collectNode(desktopWindow, WORKSPACE_TARGET_ID)).toMatchObject({ trashed: false });
    await openNode(desktopWindow, CONTEXT_A_ID);
    await focusEditor(desktopWindow);
    await expect.poll(() => collectNode(desktopWindow, CONTEXT_A_ID)).toMatchObject({ content: `${CONTEXT_A_CONTENT} 1-2 5-6` });
    await expect.poll(async () => (await loadNodeDocument(desktopWindow, CONTEXT_B_ID))?.content)
      .toBe(`${CONTEXT_B_CONTENT} 3-4`);
    await expect.poll(async () => (await loadNodeDocument(desktopWindow, CONTEXT_A_ID))?.content)
      .toBe(`${CONTEXT_A_CONTENT} 1-2 5-6`);
    await expect.poll(async () => (await loadNodeDocument(desktopWindow, CONTEXT_B_ID))?.content)
      .toBe(`${CONTEXT_B_CONTENT} 3-4`);
    await desktopWindow.reload();
    await expectWorkspaceShell(desktopWindow);
    await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
    await openNode(desktopWindow, CONTEXT_A_ID);
    await expect.poll(() => collectNode(desktopWindow, WORKSPACE_TARGET_ID)).toMatchObject({ trashed: false });
    await expect.poll(() => collectNode(desktopWindow, CONTEXT_A_ID)).toMatchObject({ content: `${CONTEXT_A_CONTENT} 1-2 5-6` });
    await openNode(desktopWindow, CONTEXT_B_ID);
    await expect.poll(() => collectNode(desktopWindow, CONTEXT_B_ID)).toMatchObject({ content: `${CONTEXT_B_CONTENT} 3-4` });
    await desktopWindow.screenshot({ path: path.resolve(`.tmp/artifacts/desktop-acceptance/t193-${recovery}-recovery.png`) });
  });
}

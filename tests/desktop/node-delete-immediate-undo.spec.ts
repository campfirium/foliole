import path from 'node:path';

import {
  collectActiveEditorState, collectNode, CONTEXT_A_ID, focusEditor, openNode, seedContextualHistoryWorkspace, undoShortcut
} from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('restores the current node immediately after body Escape and Delete', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedContextualHistoryWorkspace(desktopWindow);
  const exitFlow = desktopWindow.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible()) await exitFlow.click();
  await expect(exitFlow).toBeHidden();
  await focusEditor(desktopWindow);
  await expect.poll(() => collectActiveEditorState(desktopWindow, CONTEXT_A_ID)).toMatchObject({
    activeNodeId: CONTEXT_A_ID
  });
  await desktopWindow.keyboard.press('Escape');
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).not.toBeFocused();
  await desktopWindow.keyboard.press('Delete');
  await expect.poll(() => collectNode(desktopWindow, CONTEXT_A_ID)).toMatchObject({ trashed: true });
  await desktopWindow.keyboard.press(undoShortcut());
  await expect.poll(() => collectNode(desktopWindow, CONTEXT_A_ID)).toMatchObject({ trashed: false });
  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  await expect.poll(() => collectNode(desktopWindow, CONTEXT_A_ID)).toMatchObject({ trashed: false });
  await desktopWindow.screenshot({
    path: path.resolve('.tmp/artifacts/desktop-acceptance/node-delete-immediate-undo.png')
  });
});

for (const kind of ['topic', 'folder', 'item'] as const) {
  test(`restores a ${kind} deleted by an action while content owned undo`, async ({ desktopWindow }) => {
    await expectWorkspaceShell(desktopWindow);
    await seedContextualHistoryWorkspace(desktopWindow);
    const nodeId = `immediate-undo-${kind}`;
    await desktopWindow.evaluate(async (seeds) => window.__folioleWorkspaceDebug?.seedNodes?.(seeds), [
      { content: '# Content owner', id: CONTEXT_A_ID, kind: 'topic', title: 'Content owner' },
      { content: '# Deletion target', id: nodeId, kind, title: 'Deletion target' }
    ]);
    await openNode(desktopWindow, CONTEXT_A_ID);
    await focusEditor(desktopWindow);
    await desktopWindow.keyboard.press('Escape');
    await desktopWindow.evaluate(async (id) => window.__folioleWorkspaceDebug?.deleteNode?.(id), nodeId);
    await expect.poll(() => collectNode(desktopWindow, nodeId)).toMatchObject({ trashed: true });
    await desktopWindow.keyboard.press(undoShortcut());
    await expect.poll(() => collectNode(desktopWindow, nodeId)).toMatchObject({ trashed: false });
  });
}

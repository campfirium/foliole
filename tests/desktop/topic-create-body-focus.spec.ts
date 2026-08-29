import process from 'node:process';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const EXISTING_BODY = 'Existing topic body';
const NEW_BODY = 'Plain new topic body';
const FOLDER_ID = 'topic-create-folder';

type WindowPage = DesktopSession['firstWindow'];

async function getActiveNodeId(page: WindowPage) {
  return page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
}

async function getNodeContent(page: WindowPage, nodeId: string) {
  return page.evaluate((id) => window.__folioleWorkspaceDebug?.getNode?.(id)?.content ?? null, nodeId);
}

async function getNodeTitle(page: WindowPage, nodeId: string) {
  return page.evaluate((id) => window.__folioleWorkspaceDebug?.getNode?.(id)?.title ?? null, nodeId);
}

async function getCreationState(page: WindowPage) {
  return page.evaluate(() => {
    const debug = window.__folioleWorkspaceDebug;
    const nodeId = debug?.getActiveNodeId?.() ?? null;
    return {
      browseRootNodeId: debug?.getWorkspaceStructureState?.().browseRootNodeId ?? null,
      node: nodeId ? debug?.getNode?.(nodeId) ?? null : null,
      nodeId
    };
  });
}

async function expectCompleteRenameSelection(page: WindowPage) {
  const input = page.locator('input[aria-label^="Rename "]');
  await expect(input).toBeFocused();
  await expect.poll(() => input.evaluate((element) => {
    const target = element as HTMLInputElement;
    return target.selectionStart === 0 && target.selectionEnd === target.value.length;
  })).toBe(true);
  return input;
}

test('Create Topic focuses the new topic body for immediate typing', async ({ desktopWindow }, testInfo) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.waitForTimeout(6000);

  const createTopicButton = desktopWindow.getByRole('button', { name: /^(Create topic|创建主题)$/ });
  const initialNodeId = await getActiveNodeId(desktopWindow);
  await createTopicButton.click();
  await expect.poll(() => getActiveNodeId(desktopWindow)).not.toBe(initialNodeId);
  const existingNodeId = await getActiveNodeId(desktopWindow);
  expect(existingNodeId).toBeTruthy();

  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
  await editor.click();
  await desktopWindow.keyboard.insertText(EXISTING_BODY);
  await expect.poll(() => getNodeContent(desktopWindow, existingNodeId!)).toBe(EXISTING_BODY);

  await createTopicButton.focus();
  await expect(createTopicButton).toBeFocused();
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+N' : 'Control+N');
  await expect.poll(() => getActiveNodeId(desktopWindow)).not.toBe(existingNodeId);
  const newNodeId = await getActiveNodeId(desktopWindow);
  expect(newNodeId).toBeTruthy();
  await expect(editor).toBeFocused();

  await desktopWindow.keyboard.insertText(NEW_BODY);
  await expect.poll(() => getNodeContent(desktopWindow, newNodeId!)).toBe(NEW_BODY);
  expect(await getNodeContent(desktopWindow, existingNodeId!)).toBe(EXISTING_BODY);

  await testInfo.attach('topic-create-body-focus', {
    body: JSON.stringify({ existingNodeId, newNodeId, newBody: NEW_BODY }, null, 2),
    contentType: 'application/json'
  });
});

test('F2 rename selects the title and restores editor or tree focus by exit key', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.waitForTimeout(6000);

  const createTopicButton = desktopWindow.getByRole('button', { name: /^(Create topic|创建主题)$/ });
  const beforeNodeId = await getActiveNodeId(desktopWindow);
  await createTopicButton.focus();
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+N' : 'Control+N');
  await expect.poll(() => getActiveNodeId(desktopWindow)).not.toBe(beforeNodeId);
  const nodeId = await getActiveNodeId(desktopWindow);
  expect(nodeId).toBeTruthy();

  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
  await expect(editor).toBeFocused();
  await desktopWindow.keyboard.insertText('Body before title rename');
  await expect.poll(() => getNodeContent(desktopWindow, nodeId!)).toBe('Body before title rename');

  await desktopWindow.keyboard.press('F2');
  await expectCompleteRenameSelection(desktopWindow);
  await desktopWindow.keyboard.insertText('Title via Tab');
  await desktopWindow.keyboard.press('Tab');
  await expect.poll(() => getNodeTitle(desktopWindow, nodeId!)).toBe('Title via Tab');
  await expect(editor).toBeFocused();

  await desktopWindow.keyboard.press('F2');
  await expectCompleteRenameSelection(desktopWindow);
  await desktopWindow.keyboard.insertText('Title via Enter');
  await desktopWindow.keyboard.press('Enter');
  await expect.poll(() => getNodeTitle(desktopWindow, nodeId!)).toBe('Title via Enter');
  await expect(editor).toBeFocused();

  await desktopWindow.keyboard.press('F2');
  await expectCompleteRenameSelection(desktopWindow);
  await desktopWindow.keyboard.insertText('Cancelled editor title');
  await desktopWindow.keyboard.press('Escape');
  await expect.poll(() => getNodeTitle(desktopWindow, nodeId!)).toBe('Title via Enter');
  await expect(editor).toBeFocused();

  const treeItem = desktopWindow.locator(`[role="treeitem"][data-node-id="${nodeId}"]`);
  await treeItem.focus();
  await desktopWindow.keyboard.press('F2');
  await expectCompleteRenameSelection(desktopWindow);
  await desktopWindow.keyboard.insertText('Title via tree');
  await desktopWindow.keyboard.press('Enter');
  await expect.poll(() => getNodeTitle(desktopWindow, nodeId!)).toBe('Title via tree');
  await expect(treeItem).toBeFocused();

  await desktopWindow.keyboard.press('F2');
  await expectCompleteRenameSelection(desktopWindow);
  await desktopWindow.keyboard.insertText('Cancelled tree title');
  await desktopWindow.keyboard.press('Escape');
  await expect.poll(() => getNodeTitle(desktopWindow, nodeId!)).toBe('Title via tree');
  await expect(treeItem).toBeFocused();
});

test('Create Topic keeps writable folders visible and explicitly settles Inbox fallback', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.evaluate(async (folderId) => {
    await window.__folioleWorkspaceDebug?.seedNodes?.([{
      content: '',
      id: folderId,
      kind: 'folder',
      parentNodeId: null,
      reveal: null,
      title: 'Topic Create Folder'
    }], { persist: true });
  }, FOLDER_ID);

  await desktopWindow.getByRole('treeitem', { name: 'Topic Create Folder', exact: true }).click();
  await expect.poll(() => getCreationState(desktopWindow)).toMatchObject({ browseRootNodeId: FOLDER_ID });
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+N' : 'Control+N');
  await expect.poll(() => getCreationState(desktopWindow)).toMatchObject({
    browseRootNodeId: FOLDER_ID,
    node: { parentNodeId: FOLDER_ID }
  });
  const folderTopic = await getCreationState(desktopWindow);
  const folderTreeItem = desktopWindow.locator(`[role="treeitem"][data-node-id="${folderTopic.nodeId}"]`);
  await expect(folderTreeItem).toBeVisible();
  await expect(folderTreeItem).toHaveAttribute('aria-selected', 'true');

  await desktopWindow.getByRole('treeitem', { name: 'Home', exact: true }).click();
  await expect.poll(() => getCreationState(desktopWindow)).toMatchObject({ browseRootNodeId: 'special-home' });
  await desktopWindow.keyboard.press(process.platform === 'darwin' ? 'Meta+N' : 'Control+N');
  await expect.poll(() => getCreationState(desktopWindow)).toMatchObject({
    browseRootNodeId: 'special-inbox',
    node: { parentNodeId: 'special-inbox' }
  });
  const inboxTopic = await getCreationState(desktopWindow);
  const inboxTreeItem = desktopWindow.locator(`[role="treeitem"][data-node-id="${inboxTopic.nodeId}"]`);
  await expect(inboxTreeItem).toBeVisible();
  await expect(inboxTreeItem).toHaveAttribute('aria-selected', 'true');
  await expect(desktopWindow.locator('.prompt-editor-host .cm-content')).toBeFocused();

  await desktopWindow.keyboard.press('F2');
  const renameInput = await expectCompleteRenameSelection(desktopWindow);
  await renameInput.fill('Inbox fallback topic');
  await desktopWindow.keyboard.press('Enter');
  await expect.poll(() => getNodeTitle(desktopWindow, inboxTopic.nodeId!)).toBe('Inbox fallback topic');

  await desktopWindow.reload();
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug?.isHydrated?.()));
  await expect.poll(() => getCreationState(desktopWindow)).toMatchObject({ browseRootNodeId: 'special-inbox' });
});

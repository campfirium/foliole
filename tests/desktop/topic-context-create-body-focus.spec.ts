import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

test('Create Topic and child Topic creation both focus the new body', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await desktopWindow.waitForFunction(() => Boolean(window.__folioleWorkspaceDebug));
  await desktopWindow.waitForTimeout(6000);

  const activeNodeId = () => desktopWindow.evaluate(
    () => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null
  );
  const editor = desktopWindow.locator('.prompt-editor-host .cm-content');
  const beforeNodeId = await activeNodeId();

  await desktopWindow.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await expect.poll(activeNodeId).not.toBe(beforeNodeId);
  const parentNodeId = await activeNodeId();
  expect(parentNodeId).toBeTruthy();
  await expect(editor).toBeFocused();

  const parentTreeItem = desktopWindow.locator(`[role="treeitem"][data-node-id="${parentNodeId}"]`);
  await parentTreeItem.click({ button: 'right' });
  await desktopWindow.getByRole('menuitem', { name: /^(Create Topic|创建主题)$/ }).click();

  await expect.poll(activeNodeId).not.toBe(parentNodeId);
  const childNodeId = await activeNodeId();
  expect(childNodeId).toBeTruthy();
  await expect.poll(() => desktopWindow.evaluate(
    (nodeId) => window.__folioleWorkspaceDebug?.getNode?.(nodeId!)?.parentNodeId ?? null,
    childNodeId
  )).toBe(parentNodeId);
  await expect(editor).toBeFocused();
});

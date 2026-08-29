import process from 'node:process';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const EXISTING_BODY = 'Existing topic body';
const NEW_BODY = 'Plain new topic body';

type WindowPage = DesktopSession['firstWindow'];

async function getActiveNodeId(page: WindowPage) {
  return page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
}

async function getNodeContent(page: WindowPage, nodeId: string) {
  return page.evaluate((id) => window.__folioleWorkspaceDebug?.getNode?.(id)?.content ?? null, nodeId);
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

import process from 'node:process';

import { launchDesktopSession } from '../../scripts/windows/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const FIRST_CONTENT = '# Consecutive Create A\n\nBody A';
const SECOND_CONTENT = '# Consecutive Create B\n\nBody B';

type WindowPage = DesktopSession['firstWindow'];

async function waitForDebugBridge(windowPage: WindowPage) {
  await windowPage.waitForFunction(() => Boolean(globalThis.window?.__folioleWorkspaceDebug));
  await windowPage.waitForTimeout(6000);
}

async function createTopicFromUi(windowPage: WindowPage) {
  const previousNodeId = await getActiveNodeId(windowPage);
  await windowPage.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await expect.poll(() => getActiveNodeId(windowPage)).not.toBe(previousNodeId);
  const nodeId = await getActiveNodeId(windowPage);
  expect(nodeId).toBeTruthy();
  return nodeId!;
}

async function getActiveNodeId(windowPage: WindowPage) {
  return windowPage.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
}

async function insertEditorText(windowPage: WindowPage, text: string) {
  await expect
    .poll(() =>
      windowPage.evaluate(() =>
        globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', 0, 0) ?? false))
    .toBe(true);
  await windowPage.locator('.prompt-editor-host .cm-content').click();
  await windowPage.keyboard.insertText(text);
}

async function openNode(windowPage: WindowPage, nodeId: string) {
  await windowPage.evaluate(async (targetNodeId) => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.(targetNodeId);
  }, nodeId);
}

async function collectNodeContents(windowPage: WindowPage, nodeIds: string[]) {
  return windowPage.evaluate((nodeIds) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    return Object.fromEntries(nodeIds.map((nodeId) => [nodeId, api?.getNode?.(nodeId)?.content ?? null]));
  }, nodeIds);
}

async function collectActiveEditorState(windowPage: WindowPage) {
  return windowPage.evaluate(() => {
    const workspaceApi = globalThis.window?.__folioleWorkspaceDebug;
    const editorApi = globalThis.window?.__folioleDebug;
    const activeNodeId = workspaceApi?.getActiveNodeId?.() ?? null;
    return {
      activeNodeId,
      editorContent: editorApi?.getEditorContent?.('prompt-editor') ?? null,
      nodeContent: activeNodeId ? workspaceApi?.getNode?.(activeNodeId)?.content ?? null : null
    };
  });
}

test('consecutive created topic bodies survive switching and relaunch', async ({
  desktopSession,
  desktopWindow
}, testInfo) => {
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;

  try {
    await expectWorkspaceShell(desktopWindow);
    await waitForDebugBridge(desktopWindow);

    const firstNodeId = await createTopicFromUi(desktopWindow);
    await insertEditorText(desktopWindow, FIRST_CONTENT);
    const secondNodeId = await createTopicFromUi(desktopWindow);
    await insertEditorText(desktopWindow, SECOND_CONTENT);

    const nodeIds = [firstNodeId, secondNodeId];
    const expectedContents = {
      [firstNodeId]: FIRST_CONTENT,
      [secondNodeId]: SECOND_CONTENT
    };

    await openNode(desktopWindow, 'special-inbox');
    await expect.poll(() => collectNodeContents(desktopWindow, nodeIds), {
      message: 'consecutive created topic bodies should reach renderer node state before relaunch'
    }).toEqual(expectedContents);

    for (const nodeId of nodeIds) {
      await openNode(desktopWindow, nodeId);
      await expect.poll(() => collectActiveEditorState(desktopWindow)).toMatchObject({
        activeNodeId: nodeId,
        editorContent: expectedContents[nodeId],
        nodeContent: expectedContents[nodeId]
      });
    }

    await testInfo.attach('editor-consecutive-create-before-relaunch', {
      body: JSON.stringify({
        active: await collectActiveEditorState(desktopWindow),
        contents: await collectNodeContents(desktopWindow, nodeIds)
      }, null, 2),
      contentType: 'application/json'
    });

    const stateRoot = desktopSession.target.runtimeStateRoot;
    await desktopSession.electronApp.close();
    secondSession = await launchDesktopSession({
      env: {
        ...process.env,
        FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot
      }
    });
    await expectWorkspaceShell(secondSession.firstWindow);
    await waitForDebugBridge(secondSession.firstWindow);

    for (const nodeId of nodeIds) {
      await openNode(secondSession.firstWindow, nodeId);
      await expect.poll(() => collectActiveEditorState(secondSession!.firstWindow), {
        message: 'consecutive created topic bodies should load from runtime after relaunch'
      }).toMatchObject({
        activeNodeId: nodeId,
        editorContent: expectedContents[nodeId],
        nodeContent: expectedContents[nodeId]
      });
    }
  } finally {
    await secondSession?.close();
  }
});

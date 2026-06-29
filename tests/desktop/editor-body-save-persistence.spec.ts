import process from 'node:process';

import { launchDesktopSession } from '../../scripts/windows/playwright-desktop-harness.mjs';

import { expect, test, type DesktopSession } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const SOURCE_ID = 'playwright-editor-save-source';
const NEIGHBOR_ID = 'playwright-editor-save-neighbor';
const BASE_CONTENT = '# Save source\n\nBase body';
const CREATED_CONTENT = [
  '# Playwright Created Save Source',
  '',
  'Long pasted body for save persistence.',
  'For long articles, read one part, internalize it, then continue.',
  'For short articles, compare against internalized knowledge and converge unknown parts into recall cards.',
  'Repeat until understanding, memory, and internalization stabilize.'
].join('\n');
type WindowPage = DesktopSession['firstWindow'];

async function seedSaveWorkspace(windowPage: WindowPage) {
  await windowPage.waitForFunction(() => Boolean(globalThis.window?.__folioleWorkspaceDebug));
  await windowPage.waitForTimeout(6000);
  const seedOnce = () => windowPage.evaluate(async ({ neighborId, sourceId }) => {
    const api = globalThis.window?.__folioleWorkspaceDebug;
    await api?.seedNodes?.([
      {
        content: '# Save source\n\nBase body',
        id: sourceId,
        kind: 'topic',
        title: 'Playwright Save Source'
      },
      {
        content: '# Neighbor\n\nStable neighbor body',
        id: neighborId,
        kind: 'topic',
        title: 'Playwright Save Neighbor'
      }
    ]);
  }, { neighborId: NEIGHBOR_ID, sourceId: SOURCE_ID });
  await seedOnce();
  await windowPage.waitForTimeout(3000);
  await seedOnce();
  await expect.poll(() => collectActiveEditorState(windowPage)).toMatchObject({
    activeNodeId: SOURCE_ID,
    editorContent: BASE_CONTENT,
    nodeContent: BASE_CONTENT
  });
}

async function collectActiveEditorState(windowPage: WindowPage) {
  return windowPage.evaluate((sourceId) => {
    const workspaceApi = globalThis.window?.__folioleWorkspaceDebug;
    const editorApi = globalThis.window?.__folioleDebug;
    return {
      activeNodeId: workspaceApi?.getActiveNodeId?.() ?? null,
      editorContent: editorApi?.getEditorContent?.('prompt-editor') ?? null,
      nodeContent: workspaceApi?.getNode?.(sourceId)?.content ?? null
    };
  }, SOURCE_ID);
}

async function collectEditorOperationHistory(windowPage: WindowPage) {
  return windowPage.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getEditorOperationHistory?.() ?? null);
}

async function pasteAtEnd(windowPage: WindowPage, text: string) {
  await pasteAtPosition(windowPage, text, BASE_CONTENT.length);
}

async function pasteAtPosition(windowPage: WindowPage, text: string, position: number) {
  await expect
    .poll(() =>
      windowPage.evaluate((position) =>
        globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', position, position) ?? false,
      position)
    )
    .toBe(true);
  await windowPage.locator('.prompt-editor-host .cm-content').click();
  await windowPage.keyboard.insertText(text);
}

async function openNode(windowPage: WindowPage, nodeId: string) {
  await windowPage.evaluate(async (targetNodeId) => {
    await globalThis.window?.__folioleWorkspaceDebug?.openNode?.(targetNodeId);
  }, nodeId);
}

async function collectNodeContent(windowPage: WindowPage, nodeId: string) {
  return windowPage.evaluate((targetNodeId) =>
    globalThis.window?.__folioleWorkspaceDebug?.getNode?.(targetNodeId)?.content ?? null,
  nodeId);
}

async function createTopicFromUi(windowPage: WindowPage) {
  await windowPage.waitForFunction(() => Boolean(globalThis.window?.__folioleWorkspaceDebug));
  await windowPage.waitForTimeout(6000);
  const beforeNodeId = await windowPage.evaluate(() =>
    globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
  await windowPage.getByRole('button', { name: /^(Create topic|创建主题)$/ }).click();
  await expect
    .poll(() => windowPage.evaluate((previousNodeId) => {
      const nodeId = globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null;
      return nodeId && nodeId !== previousNodeId ? nodeId : null;
    }, beforeNodeId))
    .not.toBeNull();
  return windowPage.evaluate(() => globalThis.window?.__folioleWorkspaceDebug?.getActiveNodeId?.() ?? null);
}

test('persists a long pasted body after immediate node switch and relaunch', async ({ desktopSession, desktopWindow }, testInfo) => {
  let secondSession: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;

  try {
    await expectWorkspaceShell(desktopWindow);
    const createdNodeId = await createTopicFromUi(desktopWindow);
    expect(createdNodeId).toBeTruthy();

    await pasteAtPosition(desktopWindow, CREATED_CONTENT, 0);
    await expect.poll(() => collectNodeContent(desktopWindow, createdNodeId!)).toBe(CREATED_CONTENT);

    await openNode(desktopWindow, 'special-inbox');
    await expect.poll(() => collectNodeContent(desktopWindow, createdNodeId!)).toBe(CREATED_CONTENT);
    await desktopWindow.waitForTimeout(1800);

    await testInfo.attach('editor-save-before-relaunch', {
      body: JSON.stringify(await collectNodeContent(desktopWindow, createdNodeId!), null, 2),
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
    await openNode(secondSession.firstWindow, createdNodeId!);

    await expect.poll(() => collectNodeContent(secondSession!.firstWindow, createdNodeId!), {
      message: 'waiting for persisted source body after relaunch'
    }).toBe(CREATED_CONTENT);
  } finally {
    await secondSession?.close();
  }
});

test('keeps redo available after undoing a committed body edit', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedSaveWorkspace(desktopWindow);

  await pasteAtEnd(desktopWindow, '\nRedo candidate');
  await desktopWindow.waitForTimeout(1500);
  await expect.poll(() => collectEditorOperationHistory(desktopWindow)).toMatchObject({
    undoStack: [expect.objectContaining({ nodeId: SOURCE_ID, type: 'text.edit' })]
  });
  await expect
    .poll(() =>
      desktopWindow.evaluate((position) =>
        globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', position, position) ?? false,
      `${BASE_CONTENT}\nRedo candidate`.length)
    )
    .toBe(true);
  await desktopWindow.locator('.prompt-editor-host .cm-content').press('Control+Z');
  await expect.poll(() => collectActiveEditorState(desktopWindow)).toMatchObject({
    activeNodeId: SOURCE_ID,
    editorContent: BASE_CONTENT,
    nodeContent: BASE_CONTENT
  });

  await expect
    .poll(() =>
      desktopWindow.evaluate((position) =>
        globalThis.window?.__folioleDebug?.setEditorSelection?.('prompt-editor', position, position) ?? false,
      BASE_CONTENT.length)
    )
    .toBe(true);
  await desktopWindow.locator('.prompt-editor-host .cm-content').press('Control+Shift+Z');
  await expect.poll(() => collectActiveEditorState(desktopWindow)).toMatchObject({
    activeNodeId: SOURCE_ID,
    editorContent: `${BASE_CONTENT}\nRedo candidate`,
    nodeContent: `${BASE_CONTENT}\nRedo candidate`
  });
});

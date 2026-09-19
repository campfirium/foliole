import path from 'node:path';
import process from 'node:process';

import { launchDesktopSession } from '../../scripts/desktop/playwright-desktop-harness.mjs';

import {
  collectActiveEditorState,
  CONTEXT_A_CONTENT,
  CONTEXT_A_ID,
  CONTEXT_B_ID,
  focusEditor,
  insertEditorText,
  openNode,
  redoShortcut,
  seedContextualHistoryWorkspace,
  undoShortcut
} from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const EXTERNAL_CONTENT = `${CONTEXT_A_CONTENT} external`;
const EDITED_CONTENT = `${EXTERNAL_CONTENT} new`;
type WindowPage = Parameters<typeof insertEditorText>[0];

async function expectContent(page: WindowPage, content: string) {
  await expect.poll(() => collectActiveEditorState(page, CONTEXT_A_ID)).toMatchObject({
    editorContent: content,
    nodeContent: content
  });
}

async function exerciseFork(page: WindowPage) {
  await seedContextualHistoryWorkspace(page);
  await insertEditorText(page, ' old');
  await expectContent(page, `${CONTEXT_A_CONTENT} old`);

  expect(await page.evaluate(async ({ content, nodeId }) =>
    window.__folioleWorkspaceDebug?.updateNodeContent?.(nodeId, content),
  { content: EXTERNAL_CONTENT, nodeId: CONTEXT_A_ID })).toBe(true);
  await expectContent(page, EXTERNAL_CONTENT);
  await focusEditor(page);
  await page.keyboard.press(undoShortcut());
  await expectContent(page, EXTERNAL_CONTENT);

  await insertEditorText(page, ' new');
  await expectContent(page, EDITED_CONTENT);
  await page.keyboard.press(undoShortcut());
  await expectContent(page, EXTERNAL_CONTENT);
  await expect.poll(() => page.evaluate(() =>
    window.__folioleWorkspaceDebug?.getEditorOperationHistory?.().undoStack ?? null
  )).toEqual([]);
  await page.keyboard.press(redoShortcut());
  await expectContent(page, EDITED_CONTENT);
  await openNode(page, CONTEXT_B_ID);
  await openNode(page, CONTEXT_A_ID);
  await page.screenshot({
    path: path.resolve('.tmp/artifacts/desktop-acceptance/macos-editor-undo-divergence-visible.png')
  });
}

test('keeps new text undo usable after a confirmed external content fork and relaunch', async ({
  desktopSession,
  desktopWindow
}) => {
  let restarted: Awaited<ReturnType<typeof launchDesktopSession>> | null = null;
  try {
    await expectWorkspaceShell(desktopWindow);
    await exerciseFork(desktopWindow);

    const stateRoot = desktopSession.target.runtimeStateRoot;
    await desktopSession.electronApp.close();
    restarted = await launchDesktopSession({
      env: { ...process.env, FOLIOLE_ELECTRON_TEST_STATE_ROOT: stateRoot }
    });
    await expectWorkspaceShell(restarted.firstWindow);
    await openNode(restarted.firstWindow, CONTEXT_A_ID);
    await expectContent(restarted.firstWindow, EDITED_CONTENT);
    await focusEditor(restarted.firstWindow);
    await restarted.firstWindow.keyboard.press(undoShortcut());
    await expectContent(restarted.firstWindow, EXTERNAL_CONTENT);
    await expect.poll(() => restarted!.firstWindow.evaluate(() =>
      window.__folioleWorkspaceDebug?.getEditorOperationHistory?.().undoStack ?? null
    )).toEqual([]);
  } finally {
    await restarted?.close();
  }
});

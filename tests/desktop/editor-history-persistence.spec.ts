import fs from 'node:fs';
import path from 'node:path';

import {
  CONTEXT_A_CONTENT, CONTEXT_A_ID, CONTEXT_B_CONTENT, CONTEXT_B_ID,
  focusEditor, insertEditorText, openNode, redoShortcut, undoShortcut
} from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const OUTPUT = path.resolve('.tmp/artifacts/T578');

test('keeps undo across document switches and starts empty after renderer restart while retaining saved text', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  await page.evaluate(async (seeds) => window.__folioleWorkspaceDebug?.seedNodes?.(seeds, { persist: true }), [
    { content: CONTEXT_A_CONTENT, id: CONTEXT_A_ID, kind: 'topic', title: 'Context A' },
    { content: CONTEXT_B_CONTENT, id: CONTEXT_B_ID, kind: 'topic', title: 'Context B' }
  ]);
  await openNode(page, CONTEXT_A_ID);
  await insertEditorText(page, ' saved A');
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content).toBe(`${CONTEXT_A_CONTENT} saved A`);
  await openNode(page, CONTEXT_B_ID);
  await insertEditorText(page, ' saved B');
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_B_ID))?.content).toBe(`${CONTEXT_B_CONTENT} saved B`);
  await openNode(page, CONTEXT_A_ID);
  await focusEditor(page);
  await page.keyboard.press(undoShortcut());
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content).toBe(CONTEXT_A_CONTENT);
  await page.keyboard.press(redoShortcut());
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content).toBe(`${CONTEXT_A_CONTENT} saved A`);
  await openNode(page, CONTEXT_B_ID);
  await focusEditor(page);
  await page.keyboard.press(undoShortcut());
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_B_ID))?.content).toBe(CONTEXT_B_CONTENT);
  expect(await page.evaluate(() => window.__folioleFlushPendingEditorDraftBeforeClose?.())).toBe(true);
  expect(await page.evaluate(() => window.electronAPI?.invoke('load_editor_operation_history'))).toBeNull();
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  for (const nodeId of [CONTEXT_A_ID, CONTEXT_B_ID]) {
    await openNode(page, nodeId);
    expect(await page.evaluate(() => window.__folioleWorkspaceDebug?.getEditorOperationHistory?.()))
      .toMatchObject({ undoStack: [], redoStack: [] });
    await focusEditor(page);
    await page.keyboard.press(undoShortcut());
    await page.keyboard.press(redoShortcut());
  }
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content).toBe(`${CONTEXT_A_CONTENT} saved A`);
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_B_ID))?.content).toBe(CONTEXT_B_CONTENT);
  await insertEditorText(page, ' new session');
  await page.keyboard.press(undoShortcut());
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_B_ID))?.content).toBe(CONTEXT_B_CONTENT);
  fs.mkdirSync(OUTPUT, { recursive: true });
  await page.screenshot({ path: path.join(OUTPUT, 'native-session-history.png') });
});

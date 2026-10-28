import fs from 'node:fs';
import path from 'node:path';

import {
  CONTEXT_A_CONTENT, CONTEXT_A_ID, CONTEXT_B_CONTENT, CONTEXT_B_ID,
  focusEditor, insertEditorText, openNode, redoShortcut, undoShortcut
} from './harness/contextualContentHistory';
import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

const OUTPUT = path.resolve('.tmp/artifacts/T577');

test('restores independent topic undo and redo after close flush and renderer restart', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  await page.evaluate(async (seeds) => window.__folioleWorkspaceDebug?.seedNodes?.(seeds, { persist: true }), [
    { content: CONTEXT_A_CONTENT, id: CONTEXT_A_ID, kind: 'topic', title: 'Context A' },
    { content: CONTEXT_B_CONTENT, id: CONTEXT_B_ID, kind: 'topic', title: 'Context B' }
  ]);
  const observationStartedAt = Date.now();
  await openNode(page, CONTEXT_A_ID);
  await insertEditorText(page, ' saved A');
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content).toBe(`${CONTEXT_A_CONTENT} saved A`);
  await openNode(page, CONTEXT_B_ID);
  await insertEditorText(page, ' saved B');
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_B_ID))?.content).toBe(`${CONTEXT_B_CONTENT} saved B`);
  await page.keyboard.press(undoShortcut());
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_B_ID))?.content).toBe(CONTEXT_B_CONTENT);
  expect(await page.evaluate(() => window.__folioleFlushPendingEditorDraftBeforeClose?.())).toBe(true);
  const observation = await page.evaluate(() => window.__FOLIOLE_DESKTOP_DEBUG_PROBE__?.getSnapshot());
  const observationEndedAt = Date.now();
  const beforeReload = await page.evaluate(() => window.electronAPI?.invoke('load_editor_operation_history'));
  expect(typeof beforeReload).toBe('string');
  await page.reload();
  await expectWorkspaceShell(page);
  await page.waitForFunction(() => window.__folioleWorkspaceDebug?.isHydrated?.());
  await openNode(page, CONTEXT_B_ID);
  await focusEditor(page);
  await page.keyboard.press(redoShortcut());
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_B_ID))?.content).toBe(`${CONTEXT_B_CONTENT} saved B`);
  await openNode(page, CONTEXT_A_ID);
  await focusEditor(page);
  await page.keyboard.press(undoShortcut());
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content).toBe(CONTEXT_A_CONTENT);
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_B_ID))?.content).toBe(`${CONTEXT_B_CONTENT} saved B`);
  await page.keyboard.press(redoShortcut());
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content).toBe(`${CONTEXT_A_CONTENT} saved A`);
  expect(await page.evaluate(() => window.__folioleFlushPendingEditorDraftBeforeClose?.())).toBe(true);
  fs.mkdirSync(OUTPUT, { recursive: true });
  fs.writeFileSync(path.join(OUTPUT, 'native-history.json'), JSON.stringify({
    observationStartedAt, observationEndedAt, observation,
    beforeReload,
    afterReplay: await page.evaluate(() => window.electronAPI?.invoke('load_editor_operation_history'))
  }, null, 2));
  await page.screenshot({ path: path.join(OUTPUT, 'native-history.png') });
});

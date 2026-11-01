import path from 'node:path';

import { CONTEXT_A_CONTENT, CONTEXT_A_ID, CONTEXT_B_CONTENT, CONTEXT_B_ID,
  collectActiveEditorState, focusEditor, insertEditorText, redoShortcut, seedContextualHistoryWorkspace, undoShortcut } from './harness/contextualContentHistory';
import { clickNativeHistoryCommand } from './harness/contextualWorkspaceHistory';
import { expect, test } from './harness/fixtures';
import { loadNodeDocument } from './harness/localDataFileAcceptance';
import { expectWorkspaceShell } from './harness/settings';

test('replays actual global text order across documents through shortcuts and the native menu', async ({ desktopApp, desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await seedContextualHistoryWorkspace(page);
  await insertEditorText(page, ' A edit');
  await page.locator(`[role="treeitem"][data-node-id="${CONTEXT_B_ID}"]`).click();
  await expect.poll(() => collectActiveEditorState(page, CONTEXT_B_ID)).toMatchObject({ editorContent: CONTEXT_B_CONTENT });
  await insertEditorText(page, ' B edit');
  await page.locator(`[role="treeitem"][data-node-id="${CONTEXT_A_ID}"]`).click();
  await expect.poll(() => collectActiveEditorState(page, CONTEXT_A_ID)).toMatchObject({ editorContent: `${CONTEXT_A_CONTENT} A edit` });
  await focusEditor(page);
  await page.keyboard.press(undoShortcut());
  await expect.poll(() => collectActiveEditorState(page, CONTEXT_B_ID)).toMatchObject({ activeNodeId: CONTEXT_B_ID,
    editorContent: CONTEXT_B_CONTENT, nodeContent: CONTEXT_B_CONTENT });
  await clickNativeHistoryCommand(desktopApp, page, 'app.undo');
  await expect.poll(() => collectActiveEditorState(page, CONTEXT_A_ID)).toMatchObject({ activeNodeId: CONTEXT_A_ID,
    editorContent: CONTEXT_A_CONTENT, nodeContent: CONTEXT_A_CONTENT });
  await page.keyboard.press(redoShortcut());
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content).toBe(`${CONTEXT_A_CONTENT} A edit`);
  await clickNativeHistoryCommand(desktopApp, page, 'app.redo');
  await expect.poll(() => collectActiveEditorState(page, CONTEXT_B_ID)).toMatchObject({ activeNodeId: CONTEXT_B_ID,
    editorContent: `${CONTEXT_B_CONTENT} B edit`, nodeContent: `${CONTEXT_B_CONTENT} B edit` });
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T677/global-native-history.png') });
});

test('returns to the answer and restores its selection when undo starts on another document', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  const answerId = 'global-answer';
  const otherId = 'global-other';
  const answer = 'Answer CUTME remains';
  await page.evaluate(async seeds => window.__folioleWorkspaceDebug?.seedNodes?.(seeds), [
    { id: answerId, title: 'Answer card', kind: 'item', content: '# Prompt', reveal: answer },
    { id: otherId, title: 'Other document', kind: 'topic', content: '# Other' }
  ]);
  const exitFlow = page.getByRole('button', { name: /^(Exit Flow|退出 Flow)$/ });
  if (await exitFlow.isVisible()) await exitFlow.click();
  await expect.poll(() => page.evaluate(() => window.__folioleDebug?.getEditorContent?.('answer-editor'))).toBe(answer);
  await page.evaluate(() => window.__folioleDebug?.setEditorSelection?.('answer-editor', 7, 12));
  await page.keyboard.press('Backspace');
  await expect.poll(async () => (await loadNodeDocument(page, answerId))?.reveal).toBe('Answer  remains');
  await page.locator(`[role="treeitem"][data-node-id="${otherId}"]`).click();
  await expect.poll(() => collectActiveEditorState(page, otherId)).toMatchObject({ editorContent: '# Other' });
  await focusEditor(page);
  await page.keyboard.press(undoShortcut());
  await expect.poll(() => page.evaluate(() => ({
    active: window.__folioleWorkspaceDebug?.getActiveNodeId?.(),
    answer: window.__folioleDebug?.getEditorContent?.('answer-editor'),
    selection: window.__folioleDebug?.getEditorSelection?.('answer-editor'),
    focused: Boolean(document.querySelector('.answer-editor-host .cm-content')?.contains(document.activeElement))
  }))).toMatchObject({ active: answerId, answer, selection: { from: 7, to: 12 }, focused: true });
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T677/global-answer-selection.png') });
});

test('undoes cloze creation from inside the new card and returns to its source', async ({ desktopWindow: page }) => {
  await expectWorkspaceShell(page);
  await seedContextualHistoryWorkspace(page);
  const before = await page.evaluate(() => window.__folioleWorkspaceDebug?.listNodes?.().map(node => node.id) ?? []);
  const from = CONTEXT_A_CONTENT.indexOf('Base');
  await page.evaluate(({ from, to }) => window.__folioleDebug?.setEditorSelection?.('prompt-editor', from, to), { from, to: from + 4 });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+P' : 'Control+P');
  const palette = page.getByRole('dialog', { name: /Command palette|命令面板/ });
  await palette.locator('button[aria-label="Cloze Selection"], button[aria-label="挖空所选内容"]').click();
  await expect(palette).toBeHidden();
  let cardId = '';
  await expect.poll(async () => {
    cardId = await page.evaluate(ids => window.__folioleWorkspaceDebug?.listNodes?.().find(node => !ids.includes(node.id))?.id ?? '', before);
    return cardId;
  }).not.toBe('');
  await page.evaluate(async id => window.__folioleWorkspaceDebug?.openNode?.(id), cardId);
  await expect.poll(() => page.evaluate(() => window.__folioleWorkspaceDebug?.getActiveNodeId?.())).toBe(cardId);
  await focusEditor(page);
  await page.keyboard.press(undoShortcut());
  await expect.poll(() => page.evaluate(id => ({
    active: window.__folioleWorkspaceDebug?.getActiveNodeId?.(),
    trashed: window.__folioleWorkspaceDebug?.getNode?.(id)?.trashed
  }), cardId)).toMatchObject({ active: CONTEXT_A_ID, trashed: true });
  await expect.poll(async () => (await loadNodeDocument(page, CONTEXT_A_ID))?.content).toBe(CONTEXT_A_CONTENT);
  await page.keyboard.press(redoShortcut());
  await expect.poll(() => page.evaluate(id => window.__folioleWorkspaceDebug?.getNode?.(id)?.trashed, cardId)).toBe(false);
  await page.screenshot({ path: path.resolve('.tmp/artifacts/T677/global-cloze-from-card.png') });
});

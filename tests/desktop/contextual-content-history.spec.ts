import path from 'node:path';
import process from 'node:process';

import {
  collectActiveEditorState,
  collectNode,
  CONTEXT_A_CONTENT,
  CONTEXT_A_ID,
  CONTEXT_B_CONTENT,
  CONTEXT_B_ID,
  EMPTY_CONTEXT_ID,
  focusEditor,
  focusWorkspace,
  importPdfThroughRuntime,
  insertEditorText,
  openNode,
  PDF_HIGHLIGHT_TEXT,
  redoShortcut,
  seedContextualHistoryWorkspace,
  selectPdfHighlightText,
  undoShortcut,
  WORKSPACE_TARGET_ID
} from './harness/contextualContentHistory';
import {
  clickNativeHistoryCommand,
  createStructureTopic,
  pressWorkspaceHistory,
  readStructureHistory,
  readStructureOrder,
  runPaletteHistoryCommand,
  seedStructureWorkspace,
  STRUCTURE_TARGET_ID
} from './harness/contextualWorkspaceHistory';
import { expect, test } from './harness/fixtures';
import { expectWorkspaceShell } from './harness/settings';

const EVIDENCE_ROOT = path.resolve('.tmp/artifacts/desktop-acceptance');

async function pressUndo(page: Parameters<typeof focusEditor>[0]) {
  await page.keyboard.press(undoShortcut());
}

async function pressRedo(page: Parameters<typeof focusEditor>[0]) {
  await page.keyboard.press(redoShortcut());
}

async function exerciseImmediateMixedHistory(page: Parameters<typeof focusEditor>[0]) {
  const immediateText = '\nImmediate A edit';
  await insertEditorText(page, immediateText);
  const highlightId = await page.evaluate(async (parentNodeId) => (
    window.__folioleWorkspaceDebug?.createTextHighlightChild?.({
      anchorId: 'contextual-history-highlight',
      parentNodeId,
      text: 'Contextual history highlight'
    }) ?? null
  ), CONTEXT_A_ID);
  expect(highlightId).toBeTruthy();
  await expect.poll(() => collectNode(page, highlightId!)).toMatchObject({ trashed: false });

  await pressUndo(page);
  await expect.poll(() => collectNode(page, highlightId!)).toMatchObject({ trashed: true });
  await expect.poll(() => collectActiveEditorState(page, CONTEXT_A_ID)).toMatchObject({
    editorContent: `${CONTEXT_A_CONTENT}${immediateText}`,
    nodeContent: `${CONTEXT_A_CONTENT}${immediateText}`
  });
  await pressUndo(page);
  await expect.poll(() => collectActiveEditorState(page, CONTEXT_A_ID)).toMatchObject({
    editorContent: CONTEXT_A_CONTENT,
    nodeContent: CONTEXT_A_CONTENT
  });

  await pressRedo(page);
  await expect.poll(() => collectActiveEditorState(page, CONTEXT_A_ID)).toMatchObject({
    editorContent: `${CONTEXT_A_CONTENT}${immediateText}`,
    nodeContent: `${CONTEXT_A_CONTENT}${immediateText}`
  });
  await pressRedo(page);
  await expect.poll(() => collectNode(page, highlightId!)).toMatchObject({ trashed: false });
  return immediateText;
}

async function exerciseTopicPartition(page: Parameters<typeof focusEditor>[0], immediateText: string) {
  await insertEditorText(page, ' A-latest');
  await openNode(page, CONTEXT_B_ID);
  await insertEditorText(page, ' B-latest');
  await openNode(page, CONTEXT_A_ID);
  await focusEditor(page);
  await pressUndo(page);
  await expect.poll(() => collectActiveEditorState(page, CONTEXT_A_ID)).toMatchObject({
    editorContent: `${CONTEXT_A_CONTENT}${immediateText}`,
    nodeContent: `${CONTEXT_A_CONTENT}${immediateText}`
  });
  expect((await collectNode(page, CONTEXT_B_ID))?.content).toBe(`${CONTEXT_B_CONTENT} B-latest`);
  await pressRedo(page);
  await expect.poll(() => collectNode(page, CONTEXT_A_ID)).toMatchObject({
    content: `${CONTEXT_A_CONTENT}${immediateText} A-latest`
  });
}

async function exerciseOwnerRouting(page: Parameters<typeof focusEditor>[0]) {
  await page.evaluate(async (nodeId) => window.__folioleWorkspaceDebug?.deleteNode?.(nodeId), WORKSPACE_TARGET_ID);
  await expect.poll(() => collectNode(page, WORKSPACE_TARGET_ID)).toMatchObject({ trashed: true });
  await openNode(page, EMPTY_CONTEXT_ID);
  await focusEditor(page);
  await pressUndo(page);
  await expect.poll(() => collectNode(page, WORKSPACE_TARGET_ID)).toMatchObject({ trashed: true });

  await focusWorkspace(page);
  await pressUndo(page);
  await expect.poll(() => collectNode(page, WORKSPACE_TARGET_ID)).toMatchObject({ trashed: false });
  await pressRedo(page);
  await expect.poll(() => collectNode(page, WORKSPACE_TARGET_ID)).toMatchObject({ trashed: true });
}

test('routes immediate text and annotation history by topic without workspace fallback', async ({ desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedContextualHistoryWorkspace(desktopWindow);
  const immediateText = await exerciseImmediateMixedHistory(desktopWindow);
  await exerciseTopicPartition(desktopWindow, immediateText);
  await exerciseOwnerRouting(desktopWindow);

  await desktopWindow.screenshot({
    path: path.join(EVIDENCE_ROOT, `${process.platform}-contextual-content-history-hidden-native.png`)
  });
});

test('undoes and redoes a PDF highlight through the current content owner', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  const pdfNodeId = await importPdfThroughRuntime(desktopApp, desktopWindow);
  await openNode(desktopWindow, pdfNodeId);
  const pageInput = desktopWindow.getByRole('textbox', { name: /PDF page|PDF 页码/ });
  await pageInput.fill('3');
  await pageInput.press('Enter');
  await expect(desktopWindow.getByRole('region', { name: /PDF reader panel|PDF 阅读器面板/ }))
    .toContainText('Foliole PDF User Journey Page 3 gamma keyword');

  await desktopWindow.getByText('Foliole PDF User Journey Page 3 gamma keyword').click();
  const beforeIds = await desktopWindow.evaluate(() => window.__folioleWorkspaceDebug?.listNodes?.().map(({ id }) => id) ?? []);
  await selectPdfHighlightText(desktopWindow);
  await desktopWindow.getByRole('button', { name: /^(Highlight|高亮)$/ }).click();
  const highlightRect = desktopWindow.getByRole('region', { name: /PDF reader panel|PDF 阅读器面板/ })
    .getByTestId('pdf-highlight-rect').first();
  await expect(highlightRect).toBeVisible();
  const highlightId = await desktopWindow.evaluate((existingIds) => (
    window.__folioleWorkspaceDebug?.listNodes?.().find(({ id }) => !existingIds.includes(id))?.id ?? null
  ), beforeIds);
  expect(highlightId).toBeTruthy();
  await expect.poll(() => desktopWindow.evaluate(() => (
    window.__folioleWorkspaceDebug?.getEditorOperationHistory?.().undoStack.at(-1) ?? null
  ))).toMatchObject({ nodeId: pdfNodeId, type: 'annotation.create' });

  await pressUndo(desktopWindow);
  await expect(highlightRect).toHaveCount(0);
  await expect(desktopWindow.getByRole('treeitem', { name: PDF_HIGHLIGHT_TEXT })).toHaveCount(0);
  await expect.poll(() => collectNode(desktopWindow, highlightId!)).toMatchObject({ trashed: true });

  await pressRedo(desktopWindow);
  await expect(desktopWindow.getByRole('treeitem', { name: PDF_HIGHLIGHT_TEXT })).toBeVisible();
  await expect.poll(() => collectNode(desktopWindow, highlightId!)).toMatchObject({ trashed: false });
  await desktopWindow.screenshot({
    path: path.join(EVIDENCE_ROOT, `${process.platform}-pdf-content-history-hidden-native.png`)
  });
});

test('keeps create, rename, move, and delete in one exact workspace history', async ({ desktopApp, desktopWindow }) => {
  await expectWorkspaceShell(desktopWindow);
  await seedStructureWorkspace(desktopWindow);

  const createdId = await createStructureTopic(desktopWindow);
  await expect.poll(() => readStructureHistory(desktopWindow)).toMatchObject({
    undoStack: [{ type: 'structure.create' }]
  });
  await pressWorkspaceHistory(desktopWindow, 'undo');
  await expect.poll(() => collectNode(desktopWindow, createdId)).toMatchObject({ trashed: true });
  await pressWorkspaceHistory(desktopWindow, 'redo');
  await expect.poll(() => collectNode(desktopWindow, createdId)).toMatchObject({ trashed: false });

  const originalTitle = (await collectNode(desktopWindow, createdId))?.title;
  expect(await desktopWindow.evaluate(([nodeId, title]) =>
    window.__folioleWorkspaceDebug?.updateNodeTitle?.(nodeId!, title!) ?? false,
  [createdId, 'Renamed Structure Topic'])).toBe(true);
  await clickNativeHistoryCommand(desktopApp, desktopWindow, 'app.undo');
  await expect.poll(() => collectNode(desktopWindow, createdId)).toMatchObject({ title: originalTitle });
  await clickNativeHistoryCommand(desktopApp, desktopWindow, 'app.redo');
  await expect.poll(() => collectNode(desktopWindow, createdId)).toMatchObject({ title: 'Renamed Structure Topic' });

  const beforeMoveOrder = await readStructureOrder(desktopWindow);
  expect(await desktopWindow.evaluate(([nodeId, targetId]) =>
    window.__folioleWorkspaceDebug?.moveNodes?.([nodeId!], targetId!, 'before') ?? false,
  [createdId, STRUCTURE_TARGET_ID])).toBe(true);
  await expect.poll(() => readStructureOrder(desktopWindow)).not.toEqual(beforeMoveOrder);
  await runPaletteHistoryCommand(desktopWindow, 'Undo Move Topic');
  await expect.poll(() => readStructureOrder(desktopWindow)).toEqual(beforeMoveOrder);
  await runPaletteHistoryCommand(desktopWindow, 'Redo Move Topic');
  await expect.poll(() => readStructureOrder(desktopWindow)).not.toEqual(beforeMoveOrder);

  await desktopWindow.evaluate(async (nodeId) => window.__folioleWorkspaceDebug?.deleteNode?.(nodeId), createdId);
  await expect.poll(() => collectNode(desktopWindow, createdId)).toMatchObject({ trashed: true });
  const notice = desktopWindow.getByText('Moved to Trash.', { exact: true });
  await expect(notice).toBeVisible();
  await notice.locator('..').getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => collectNode(desktopWindow, createdId)).toMatchObject({ trashed: false });
  await expect(notice).toBeHidden();

  const historyBeforeControl = await readStructureHistory(desktopWindow);
  expect(await desktopWindow.evaluate(() =>
    window.__folioleWorkspaceDebug?.shelveNode?.('playwright-review-control', '2026-08-13T01:00:00.000Z') ?? false
  )).toBe(true);
  expect(await readStructureHistory(desktopWindow)).toEqual(historyBeforeControl);
  await pressWorkspaceHistory(desktopWindow, 'redo');
  await expect.poll(() => collectNode(desktopWindow, createdId)).toMatchObject({ trashed: true });

  await desktopWindow.screenshot({
    path: path.join(EVIDENCE_ROOT, `${process.platform}-workspace-structure-history-hidden-native.png`)
  });
});

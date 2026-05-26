import { expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { runAppCommand } from './appCommands';

function createReviewCommandActions() {
  return {
    revealReviewAnswer: () => undefined,
    toggleReviewMode: () => undefined,
    gradeReviewAgain: () => undefined,
    gradeReviewHard: () => undefined,
    gradeReviewGood: () => undefined,
    gradeReviewEasy: () => undefined,
    readingReviewSoon: () => undefined,
    readingReviewLater: () => undefined,
    readingReviewRead: () => undefined,
    readingReviewDismiss: () => undefined,
    reviewScrollReadingDown: () => undefined,
    reviewScrollReadingUp: () => undefined,
    deleteCurrentReviewItem: () => undefined,
    reviewNavigateParent: () => undefined,
    reviewNavigateBack: () => undefined,
    reviewNavigateForward: () => undefined,
    reviewNavigateDown: () => undefined,
    reviewNavigatePreviousSibling: () => undefined,
    reviewNavigateNextSibling: () => undefined,
    deleteReviewSourceTopic: () => undefined
  };
}

function createCommandActions(overrides: Partial<Parameters<typeof runAppCommand>[1]> = {}) {
  return {
    undo: () => undefined,
    redo: () => undefined,
    closeSettings: () => undefined,
    createFolder: () => undefined,
    createItem: () => undefined,
    createSelectionCloze: () => undefined,
    createSelectionHighlight: () => undefined,
    createTopic: () => undefined,
    createVirtualNode: () => undefined,
    addSelectionNote: () => undefined,
    repairTable: () => undefined,
    enterPriorityMode: () => undefined,
    exportCurrentArticle: () => undefined,
    findInTopic: () => undefined,
    mergeHighlightsIntoTopic: () => undefined,
    goBack: () => undefined,
    goForward: () => undefined,
    goToNode: () => undefined,
    moveToNode: () => undefined,
    renameNode: () => undefined,
    goParent: () => undefined,
    toggleDismissedTopicsVisibility: () => undefined,
    toggleImmersiveMode: () => undefined,
    importDirectory: () => undefined,
    importSingleFile: () => undefined,
    reimportSelectedTopic: () => undefined,
    openImportManagement: () => undefined,
    resetImportData: () => undefined,
    toggleDevReviewStatusBarPersistence: () => undefined,
    openNotes: () => undefined,
    openReadwiseReaderSettings: () => undefined,
    openSettings: () => undefined,
    openTrash: () => undefined,
    restartApp: () => undefined,
    setPdfReadingMode: () => undefined,
    toggleBaseColorMode: () => undefined,
    startClipboardImport: () => undefined,
    toggleEditorDisplayMode: () => undefined,
    toggleList: () => undefined,
    ...createReviewCommandActions(),
    toggleDevTools: () => undefined,
    ...overrides
  };
}

function expectCommandRuns(commandId: string, overrides: Partial<Parameters<typeof runAppCommand>[1]>) {
  expect(runAppCommand(commandId, createCommandActions(overrides))).toBe(true);
}

it('runs undo and redo through the shared command handler', () => {
  const undo = vi.fn();
  const redo = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.undo, { undo });
  expectCommandRuns(APP_COMMAND_IDS.redo, { redo });

  expect(undo).toHaveBeenCalledTimes(1);
  expect(redo).toHaveBeenCalledTimes(1);
});

it('runs toggle devtools through the shared command handler', () => {
  const toggleDevTools = vi.fn();
  const importSingleFile = vi.fn();
  const importDirectory = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.toggleDevTools, { importDirectory, importSingleFile, toggleDevTools });

  expect(toggleDevTools).toHaveBeenCalledTimes(1);
  expect(importSingleFile).not.toHaveBeenCalled();
  expect(importDirectory).not.toHaveBeenCalled();
});

it('runs the dev review status bar persistence toggle through the shared command handler', () => {
  const toggleDevReviewStatusBarPersistence = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.toggleDevReviewStatusBarPersistence, { toggleDevReviewStatusBarPersistence });

  expect(toggleDevReviewStatusBarPersistence).toHaveBeenCalledTimes(1);
});

it('runs go to node through the shared command handler', () => {
  const goToNode = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.goToNode, { goToNode });

  expect(goToNode).toHaveBeenCalledTimes(1);
});

it('runs move to through the shared command handler', () => {
  const moveToNode = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.moveToNode, { moveToNode });

  expect(moveToNode).toHaveBeenCalledTimes(1);
});

it('runs rename through the shared command handler', () => {
  const renameNode = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.renameNode, { renameNode });

  expect(renameNode).toHaveBeenCalledTimes(1);
});

it('runs repair table through the shared command handler', () => {
  const repairTable = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.repairTable, { repairTable });

  expect(repairTable).toHaveBeenCalledTimes(1);
});

it('runs review navigation commands through the shared command handler', () => {
  const reviewNavigateParent = vi.fn();
  const reviewNavigateNextSibling = vi.fn();
  const reviewScrollReadingDown = vi.fn();
  const reviewScrollReadingUp = vi.fn();
  const deleteReviewSourceTopic = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.reviewNavigateParent, { reviewNavigateParent });
  expectCommandRuns(APP_COMMAND_IDS.reviewNavigateNextSibling, { reviewNavigateNextSibling });
  expectCommandRuns(APP_COMMAND_IDS.reviewScrollReadingDown, { reviewScrollReadingDown });
  expectCommandRuns(APP_COMMAND_IDS.reviewScrollReadingUp, { reviewScrollReadingUp });
  expectCommandRuns(APP_COMMAND_IDS.deleteReviewSourceTopic, { deleteReviewSourceTopic });

  expect(reviewNavigateParent).toHaveBeenCalledTimes(1);
  expect(reviewNavigateNextSibling).toHaveBeenCalledTimes(1);
  expect(reviewScrollReadingDown).toHaveBeenCalledTimes(1);
  expect(reviewScrollReadingUp).toHaveBeenCalledTimes(1);
  expect(deleteReviewSourceTopic).toHaveBeenCalledTimes(1);
});

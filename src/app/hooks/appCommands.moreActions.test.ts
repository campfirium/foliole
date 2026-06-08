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
    openPerformancePanel: () => undefined,
    resetImportData: () => undefined,
    toggleDevReviewStatusBarPersistence: () => undefined,
    openGuidedSample: () => undefined,
    openNotes: () => undefined,
    openHelpSearch: () => undefined,
    checkForUpdates: () => undefined,
    openLatestRelease: () => undefined,
    openGitHubRepository: () => undefined,
    sendFeedback: () => undefined,
    openSupportEmail: () => undefined,
    openGitHubIssues: () => undefined,
    openGitHubDiscussions: () => undefined,
    openYouTubePlaylist: () => undefined,
    openReadwiseReaderSettings: () => undefined,
    openSettings: () => undefined,
    openTrash: () => undefined,
    restartApp: () => undefined,
    setPdfReadingMode: () => undefined,
    toggleBaseColorMode: () => undefined,
    startClipboardImport: () => undefined,
    toggleEditorDisplayMode: () => undefined,
    toggleList: () => undefined,
    toggleRightSidebar: () => undefined,
    toggleBothSidebars: () => undefined,
    ...createReviewCommandActions(),
    toggleDevTools: () => undefined,
    ...overrides
  };
}

function expectCommandRuns(commandId: string, overrides: Partial<Parameters<typeof runAppCommand>[1]>) {
  expect(runAppCommand(commandId, createCommandActions(overrides))).toBe(true);
}

it('runs create topic through the shared command handler', () => {
  const createTopic = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.createTopic, { createTopic });

  expect(createTopic).toHaveBeenCalledTimes(1);
});

it('runs restart app through the shared command handler', () => {
  const restartApp = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.restartApp, { restartApp });

  expect(restartApp).toHaveBeenCalledTimes(1);
});

it('runs open Readwise Reader settings through the shared command handler', () => {
  const openReadwiseReaderSettings = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.openReadwiseReaderSettings, { openReadwiseReaderSettings });

  expect(openReadwiseReaderSettings).toHaveBeenCalledTimes(1);
});

it('runs selection annotation actions through the shared command handler', () => {
  const createSelectionHighlight = vi.fn();
  const createSelectionCloze = vi.fn();
  const addSelectionNote = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.createSelectionHighlight, { createSelectionHighlight });
  expectCommandRuns(APP_COMMAND_IDS.createSelectionCloze, { createSelectionCloze });
  expectCommandRuns(APP_COMMAND_IDS.addSelectionNote, { addSelectionNote });

  expect(createSelectionHighlight).toHaveBeenCalledTimes(1);
  expect(createSelectionCloze).toHaveBeenCalledTimes(1);
  expect(addSelectionNote).toHaveBeenCalledTimes(1);
});

it('runs light and dark mode toggle through the shared command handler', () => {
  const toggleBaseColorMode = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.toggleBaseColorMode, { toggleBaseColorMode });

  expect(toggleBaseColorMode).toHaveBeenCalledTimes(1);
});

it('runs PDF dark appearance choices through the shared command handler', () => {
  const setPdfReadingMode = vi.fn();

  expectCommandRuns(APP_COMMAND_IDS.setPdfDarkAppearanceOriginal, { setPdfReadingMode });
  expectCommandRuns(APP_COMMAND_IDS.setPdfDarkAppearanceInverted, { setPdfReadingMode });
  expectCommandRuns(APP_COMMAND_IDS.setPdfDarkAppearanceWarm, { setPdfReadingMode });

  expect(setPdfReadingMode).toHaveBeenNthCalledWith(1, 'original');
  expect(setPdfReadingMode).toHaveBeenNthCalledWith(2, 'inverted');
  expect(setPdfReadingMode).toHaveBeenNthCalledWith(3, 'warm');
});

it('lets reset import data cancel without reporting success', () => {
  const resetImportData = vi.fn(() => false);

  expect(
    runAppCommand(APP_COMMAND_IDS.resetImportData, createCommandActions({
      resetImportData
    }))
  ).toBe(false);

  expect(resetImportData).toHaveBeenCalledTimes(1);
});

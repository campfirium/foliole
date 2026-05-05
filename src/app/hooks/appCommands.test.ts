import { describe, expect, it, vi } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { buildAppPaletteItems, runAppCommand, runReviewModeToggle } from './appCommands';

function createCommandActions(overrides: Partial<Parameters<typeof runAppCommand>[1]> = {}) {
  return {
    closeSettings: () => undefined,
    createFolder: () => undefined,
    createItem: () => undefined,
    createTopic: () => undefined,
    createVirtualNode: () => undefined,
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
    toggleImmersiveMode: () => undefined,
    importDirectory: () => undefined,
    importSingleFile: () => undefined,
    openImportManagement: () => undefined,
    resetImportData: () => undefined,
    openNotes: () => undefined,
    openReadwiseReaderSettings: () => undefined,
    openSettings: () => undefined,
    openTrash: () => undefined,
    restartApp: () => undefined,
    toggleBaseColorMode: () => undefined,
    revealReviewAnswer: () => undefined,
    startClipboardImport: () => undefined,
    toggleReviewMode: () => undefined,
    toggleEditorDisplayMode: () => undefined,
    toggleList: () => undefined,
    gradeReviewAgain: () => undefined,
    gradeReviewHard: () => undefined,
    gradeReviewGood: () => undefined,
    gradeReviewEasy: () => undefined,
    readingReviewLater: () => undefined,
    readingReviewRead: () => undefined,
    readingReviewDismiss: () => undefined,
    toggleDevTools: () => undefined,
    ...overrides
  };
}

function expectCommandRuns(commandId: string, overrides: Partial<Parameters<typeof runAppCommand>[1]>) {
  expect(runAppCommand(commandId, createCommandActions(overrides))).toBe(true);
}

function createPaletteOptions(isReviewMode: boolean) {
  return {
    canImportFile: true,
    canImportFolder: true,
    canExportCurrentArticle: true,
    canMergeHighlightsIntoTopic: true,
    canRenameNode: true,
    canResetImportData: true,
    canGoBack: true,
    canGoForward: true,
    canGoToNode: true,
    canMoveToNode: true,
    canGoParent: true,
    canFindInCurrentTopic: true,
    canToggleImmersiveMode: true,
    canSetNodePriority: true,
    canRevealAnswer: true,
    canToggleReviewMode: true,
    canGradeReview: true,
    canDeferReadingReview: true,
    canCompleteReadingReview: true,
    canDismissReadingReview: true,
    isImmersiveMode: false,
    resolvedBaseColorMode: 'light' as const,
    isReviewMode
  };
}

function expectCorePaletteEntries() {
  const items = buildAppPaletteItems(createPaletteOptions(false));

  expect(items.length).toBeGreaterThanOrEqual(12);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.createFolder)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.createTopic)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.createItem)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.createVirtualNode)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.toggleList)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.toggleDevTools)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.goBack)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.goToNode)).toBe(true);
  expect(items.find((item) => item.id === APP_COMMAND_IDS.goToNode)?.title).toBe('Go to…');
  expect(items.some((item) => item.id === APP_COMMAND_IDS.moveToNode)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.renameNode)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.findInTopic)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.enterPriorityMode)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.gradeReviewGood)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.importSingleFile)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.importFolder)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.openImportManagement)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.openReadwiseReaderSettings)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.toggleBaseColorMode)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.resetImportData)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.exportCurrentArticle)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.mergeHighlightsIntoTopic)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.restartApp)).toBe(true);
}

describe('buildAppPaletteItems', () => {
  it('includes migrated command entries instead of a minimal fallback list', () => {
    expectCorePaletteEntries();
  });

  it('shows review-mode command as exit when already in review mode', () => {
    const items = buildAppPaletteItems(createPaletteOptions(true));
    const reviewModeItem = items.find((item) => item.id === APP_COMMAND_IDS.startStudyMode);
    expect(reviewModeItem?.title).toBe('Exit Review Mode');
  });

  it('shows the next light or dark mode action from the resolved mode', () => {
    const darkItems = buildAppPaletteItems({
      ...createPaletteOptions(false),
      resolvedBaseColorMode: 'dark'
    });
    const lightItems = buildAppPaletteItems(createPaletteOptions(false));

    expect(darkItems.find((item) => item.id === APP_COMMAND_IDS.toggleBaseColorMode)?.title).toBe('Switch to Light Mode');
    expect(lightItems.find((item) => item.id === APP_COMMAND_IDS.toggleBaseColorMode)?.title).toBe('Switch to Dark Mode');
  });
});

describe('runAppCommand basics', () => {
  it('runs toggle devtools through the shared command handler', () => {
    const toggleDevTools = vi.fn();
    const importSingleFile = vi.fn();
    const importDirectory = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.toggleDevTools, { importDirectory, importSingleFile, toggleDevTools });

    expect(toggleDevTools).toHaveBeenCalledTimes(1);
    expect(importSingleFile).not.toHaveBeenCalled();
    expect(importDirectory).not.toHaveBeenCalled();
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

  it('runs formal import through the shared command handler', () => {
    const importSingleFile = vi.fn();
    const importDirectory = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.importSingleFile, { importDirectory, importSingleFile });

    expect(importSingleFile).toHaveBeenCalledTimes(1);
    expect(importDirectory).not.toHaveBeenCalled();
  });

  it('runs export current article through the shared command handler', () => {
    const exportCurrentArticle = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.exportCurrentArticle, { exportCurrentArticle });

    expect(exportCurrentArticle).toHaveBeenCalledTimes(1);
  });

  it('runs merge highlights into topic through the shared command handler', () => {
    const mergeHighlightsIntoTopic = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.mergeHighlightsIntoTopic, { mergeHighlightsIntoTopic });

    expect(mergeHighlightsIntoTopic).toHaveBeenCalledTimes(1);
  });

  it('runs find in topic through the shared command handler', () => {
    const findInTopic = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.findInTopic, { findInTopic });

    expect(findInTopic).toHaveBeenCalledTimes(1);
  });

  it('runs enter priority mode through the shared command handler', () => {
    const enterPriorityMode = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.enterPriorityMode, { enterPriorityMode });

    expect(enterPriorityMode).toHaveBeenCalledTimes(1);
  });

  it('runs immersive reading toggle through the shared command handler', () => {
    const toggleImmersiveMode = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.toggleImmersiveMode, { toggleImmersiveMode });

    expect(toggleImmersiveMode).toHaveBeenCalledTimes(1);
  });
});

describe('runAppCommand more actions', () => {
  it('runs create topic through the shared command handler', () => {
    const createTopic = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.createTopic, { createTopic });

    expect(createTopic).toHaveBeenCalledTimes(1);
  });

  it('runs create virtual node through the shared command handler', () => {
    const createVirtualNode = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.createVirtualNode, { createVirtualNode });

    expect(createVirtualNode).toHaveBeenCalledTimes(1);
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

  it('runs light and dark mode toggle through the shared command handler', () => {
    const toggleBaseColorMode = vi.fn();

    expectCommandRuns(APP_COMMAND_IDS.toggleBaseColorMode, { toggleBaseColorMode });

    expect(toggleBaseColorMode).toHaveBeenCalledTimes(1);
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
});

describe('runReviewModeToggle', () => {
  it('enters mode when currently outside review mode', () => {
    let entered = 0;
    let exited = 0;
    runReviewModeToggle(false, {
      enterReviewMode: () => {
        entered += 1;
      },
      exitReviewMode: () => {
        exited += 1;
      }
    });
    expect(entered).toBe(1);
    expect(exited).toBe(0);
  });

  it('exits mode when currently inside review mode', () => {
    let entered = 0;
    let exited = 0;
    runReviewModeToggle(true, {
      enterReviewMode: () => {
        entered += 1;
      },
      exitReviewMode: () => {
        exited += 1;
      }
    });
    expect(entered).toBe(0);
    expect(exited).toBe(1);
  });
});

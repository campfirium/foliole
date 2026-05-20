import { describe, expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { type BuildAppPaletteItemsOptions, getAppPaletteCommands } from './appPaletteCommandCatalog';

const enabledOptions: BuildAppPaletteItemsOptions = {
  canCompleteReadingReview: true,
  canDeleteReviewItem: true,
  canDeferReadingReview: true,
  canDismissReadingReview: true,
  canAnnotateSelection: true,
  canExportCurrentArticle: true,
  canFindInCurrentTopic: true,
  canGoBack: true,
  canGoForward: true,
  canGoParent: true,
  canGoToNode: true,
  canGradeReview: true,
  canImportFile: true,
  canImportFolder: true,
  canMergeHighlightsIntoTopic: true,
  canRepairTable: true,
  canMoveToNode: true,
  canRenameNode: true,
  canRedoWorkspaceAction: true,
  canReimportSelectedTopic: true,
  canResetImportData: true,
  canToggleDevReviewStatusBarPersistence: true,
  canRevealAnswer: true,
  canSetNodePriority: true,
  canToggleImmersiveMode: true,
  canToggleReviewMode: true,
  canUndoWorkspaceAction: true,
  isImmersiveMode: false,
  isDevReviewStatusBarPersistenceEnabled: false,
  isReviewMode: false,
  redoWorkspaceActionTitle: 'Redo',
  undoWorkspaceActionTitle: 'Undo'
};

function sectionFor(commandId: string) {
  return getAppPaletteCommands(enabledOptions).find((item) => item.id === commandId)?.section;
}

describe('getAppPaletteCommands', () => {
  it('assigns creation commands to the Create section', () => {
    expect(sectionFor(APP_COMMAND_IDS.createTopic)).toBe('Create');
    expect(sectionFor(APP_COMMAND_IDS.createFolder)).toBe('Create');
    expect(sectionFor(APP_COMMAND_IDS.createVirtualNode)).toBe('Create');
  });

  it('keeps command palette sections aligned with the information architecture', () => {
    expect(sectionFor(APP_COMMAND_IDS.toggleDevTools)).toBe('Developer');
    expect(sectionFor(APP_COMMAND_IDS.reimportSelectedTopic)).toBe('Developer');
    expect(sectionFor(APP_COMMAND_IDS.toggleDevReviewStatusBarPersistence)).toBe('Developer');
    expect(sectionFor(APP_COMMAND_IDS.enterPriorityMode)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.exportCurrentArticle)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.mergeHighlightsIntoTopic)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.repairTable)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.renameNode)).toBe('Workspace');
  });

  it('uses dynamic labels for the dev review status bar memory toggle', () => {
    expect(
      getAppPaletteCommands({ ...enabledOptions, isDevReviewStatusBarPersistenceEnabled: false }).find(
        (item) => item.id === APP_COMMAND_IDS.toggleDevReviewStatusBarPersistence
      )?.title
    ).toBe('DEV Enable Review Status Bar Memory');
    expect(
      getAppPaletteCommands({ ...enabledOptions, isDevReviewStatusBarPersistenceEnabled: true }).find(
        (item) => item.id === APP_COMMAND_IDS.toggleDevReviewStatusBarPersistence
      )?.title
    ).toBe('DEV Disable Review Status Bar Memory');
  });
});

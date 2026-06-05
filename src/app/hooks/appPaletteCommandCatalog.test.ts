import { describe, expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { buildCommandMenuSections } from '../../shared/commands/menuModel';

import { type BuildAppPaletteItemsOptions, getAppPaletteCommands } from './appPaletteCommandCatalog';

const enabledOptions: BuildAppPaletteItemsOptions = {
  canReadReviewTopic: true,
  canSoonReadingReview: true,
  canDeleteReviewItem: true,
  canPostponeReviewTopic: true,
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
  });

  it('keeps command palette sections aligned with the information architecture', () => {
    expect(sectionFor(APP_COMMAND_IDS.toggleDevTools)).toBe('Developer');
    expect(sectionFor(APP_COMMAND_IDS.reimportSelectedTopic)).toBe('Developer');
    expect(sectionFor(APP_COMMAND_IDS.openPerformancePanel)).toBe('Developer');
    expect(sectionFor(APP_COMMAND_IDS.toggleDevReviewStatusBarPersistence)).toBe('Developer');
    expect(sectionFor(APP_COMMAND_IDS.enterPriorityMode)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.exportCurrentArticle)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.mergeHighlightsIntoTopic)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.repairTable)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.openHelpSearch)).toBe('Workspace');
    expect(sectionFor(APP_COMMAND_IDS.openGuidedSample)).toBe('Workspace');
    expect(sectionFor(APP_COMMAND_IDS.renameNode)).toBe('Workspace');
    expect(sectionFor(APP_COMMAND_IDS.setPdfDarkAppearanceWarm)).toBe('Settings');
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

  it('keeps help knowledge entries out of ordinary command results', () => {
    const items = getAppPaletteCommands(enabledOptions);
    const helpCommand = items.find((item) => item.id === APP_COMMAND_IDS.openHelpSearch);
    const relearnResults = buildCommandMenuSections(items, [], 'relearn').flatMap((section) => section.items);
    const priorityResults = buildCommandMenuSections(items, [], 'priority').flatMap((section) => section.items);

    expect(helpCommand).toMatchObject({ enabled: true, title: 'DEV Open Help Search' });
    expect(items.some((item) => item.id.startsWith('actionHelp.'))).toBe(false);
    expect(relearnResults.map((item) => item.title)).not.toContain('Relearn');
    expect(priorityResults.map((item) => item.title)).not.toContain('Relearn');
  });
});

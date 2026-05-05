import { describe, expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import { type BuildAppPaletteItemsOptions, getAppPaletteCommands } from './appPaletteCommandCatalog';

const enabledOptions: BuildAppPaletteItemsOptions = {
  canCompleteReadingReview: true,
  canDeferReadingReview: true,
  canDismissReadingReview: true,
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
  canMoveToNode: true,
  canResetImportData: true,
  canRevealAnswer: true,
  canSetNodePriority: true,
  canToggleImmersiveMode: true,
  canToggleReviewMode: true,
  isImmersiveMode: false,
  isReviewMode: false,
  resolvedBaseColorMode: 'light'
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
    expect(sectionFor(APP_COMMAND_IDS.enterPriorityMode)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.exportCurrentArticle)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.mergeHighlightsIntoTopic)).toBe('Editor');
  });
});

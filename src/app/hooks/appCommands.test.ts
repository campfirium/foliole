import { beforeAll, describe, expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import {
  preloadTranslationCatalog,
  translate,
  type TranslationKey
} from '../../shared/localization/translations';

import { buildAppPaletteItems } from './appCommands';
import { runReviewModeToggle } from './reviewModeToggle';

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

function createPaletteOptions(isReviewMode: boolean) {
  return {
    canImportFile: true,
    canRedoWorkspaceAction: false,
    canUndoWorkspaceAction: false,
    canImportFolder: true,
    canExportCurrentArticle: true,
    canAnnotateSelection: true,
    canMergeHighlightsIntoTopic: true,
    canRepairTable: true,
    canRenameNode: true,
    canReimportSelectedTopic: true,
    canResetImportData: true,
    canToggleDevTools: true,
    canToggleDevReviewStatusBarPersistence: true,
    canGoBack: true,
    canGoToLastChild: true,
    canGoForward: true,
    canGoToNode: true,
    canMoveToNode: true,
    canGoParent: true,
    canFindInCurrentTopic: true,
    canOpenComparisonView: true,
    canToggleImmersiveMode: true,
    canSetNodePriority: true,
    canScrollCurrentDocument: true,
    canRevealAnswer: true,
    canToggleReviewMode: true,
    canGradeReview: true,
    canSoonReadingReview: true,
    canPostponeReviewTopic: true,
    canReadReviewTopic: true,
    canDismissReadingReview: true,
    canDeleteReviewItem: true,
    isImmersiveMode: false,
    isDevReviewStatusBarPersistenceEnabled: false,
    isReviewMode,
    redoWorkspaceActionTitle: 'Redo',
    t: (key: TranslationKey) => translate('en', key),
    undoWorkspaceActionTitle: 'Undo'
  };
}

function expectFourWayNavigationTitles(items: ReturnType<typeof buildAppPaletteItems>) {
  expect(
    [
      APP_COMMAND_IDS.goBack,
      APP_COMMAND_IDS.goForward,
      APP_COMMAND_IDS.goParent,
      APP_COMMAND_IDS.goToLastChild
    ].map((commandId) => items.find((item) => item.id === commandId)?.title)
  ).toEqual(['Go Back', 'Go Forward', 'Go Up', 'Go Down']);
}

function expectEditorPaletteEntries(items: ReturnType<typeof buildAppPaletteItems>) {
  expect(items.some((item) => item.id === APP_COMMAND_IDS.exportCurrentArticle)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.mergeHighlightsIntoTopic)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.createSelectionHighlight)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.createSelectionCloze)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.addSelectionNote)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.repairTable)).toBe(true);
}

function expectCorePaletteEntries() {
  const items = buildAppPaletteItems(createPaletteOptions(false));

  expect(items.length).toBeGreaterThanOrEqual(12);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.createFolder)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.createTopic)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.createItem)).toBe(true);
  expect(items.find((item) => item.id === APP_COMMAND_IDS.createVirtualFolder)).toMatchObject({
    enabled: true,
    title: 'Create Virtual Folder'
  });
  expect(items.find((item) => item.id === APP_COMMAND_IDS.undo)).toMatchObject({
    enabled: false,
    title: 'Undo'
  });
  expect(items.find((item) => item.id === APP_COMMAND_IDS.redo)).toMatchObject({
    enabled: false,
    title: 'Redo'
  });
  expect(items.some((item) => item.id === APP_COMMAND_IDS.toggleList)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.toggleDevTools)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.goBack)).toBe(true);
  expectFourWayNavigationTitles(items);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.goToNode)).toBe(true);
  expect(items.find((item) => item.id === APP_COMMAND_IDS.goToNode)?.title).toBe('Go to...');
  expect(items.some((item) => item.id === APP_COMMAND_IDS.moveToNode)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.renameNode)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.findInTopic)).toBe(true);
  expect(items.find((item) => item.id === APP_COMMAND_IDS.toggleComparisonView)).toMatchObject({
    enabled: true,
    title: 'Compare with Draft'
  });
  expect(items.some((item) => item.id === APP_COMMAND_IDS.enterPriorityMode)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.gradeReviewGood)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.importSingleFile)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.importFolder)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.openReadwiseReaderSettings)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.toggleBaseColorMode)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.setPdfDarkAppearanceOriginal)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.setPdfDarkAppearanceInverted)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.setPdfDarkAppearanceWarm)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.resetImportData)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.openPerformancePanel)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.openGuidedSample)).toBe(true);
  expect(items.find((item) => item.id === APP_COMMAND_IDS.openWorkspaceSearch)).toMatchObject({
    title: 'Search'
  });
  expect(items.find((item) => item.id === APP_COMMAND_IDS.openCommandPalette)).toMatchObject({
    title: 'Command Palette'
  });
  expect(items.some((item) => item.id === APP_COMMAND_IDS.checkForUpdates)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.openLatestRelease)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.openGitHubRepository)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.sendFeedback)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.openSupportEmail)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.openGitHubIssues)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.openGitHubDiscussions)).toBe(true);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.openYouTubePlaylist)).toBe(true);
  expectEditorPaletteEntries(items);
  expect(items.some((item) => item.id === APP_COMMAND_IDS.restartApp)).toBe(true);
}

function expectDocumentScrollPaletteEntries() {
  const items = buildAppPaletteItems(createPaletteOptions(false));
  expect(items.find((item) => item.id === APP_COMMAND_IDS.scrollDocumentTop)).toMatchObject({
    enabled: true,
    title: 'Scroll to Document Top'
  });
  expect(items.find((item) => item.id === APP_COMMAND_IDS.scrollDocumentBottom)?.shortcuts).toBeUndefined();
}

describe('buildAppPaletteItems localization', () => {
  it('publishes document scroll commands without default shortcuts', expectDocumentScrollPaletteEntries);
  it('uses localized command titles from the caller translation function', () => {
    const items = buildAppPaletteItems({
      ...createPaletteOptions(false),
      t: (key) => translate('zh-Hans', key)
    });

    expect(items.find((item) => item.id === APP_COMMAND_IDS.openCommandPalette)).toMatchObject({
      section: '工作区',
      sectionId: 'Workspace',
      title: '命令面板'
    });
    expect(items.some((item) => item.title.startsWith('desktop.command.'))).toBe(false);
  });
});

describe('buildAppPaletteItems', () => {
  it('includes migrated command entries instead of a minimal fallback list', () => {
    expectCorePaletteEntries();
  });

  it('shows the Flow mode toggle command', () => {
    const items = buildAppPaletteItems(createPaletteOptions(true));
    const reviewModeItem = items.find((item) => item.id === APP_COMMAND_IDS.startStudyMode);
    expect(reviewModeItem?.title).toBe('Toggle Flow Mode');
  });

  it('shows the light or dark mode toggle action', () => {
    const lightItems = buildAppPaletteItems(createPaletteOptions(false));

    expect(lightItems.find((item) => item.id === APP_COMMAND_IDS.toggleBaseColorMode)?.title).toBe(
      'Cycle Appearance Mode'
    );
  });

  it('uses dynamic undo and redo action titles', () => {
    const items = buildAppPaletteItems({
      ...createPaletteOptions(false),
      canRedoWorkspaceAction: true,
      canUndoWorkspaceAction: true,
      redoWorkspaceActionTitle: 'Redo Dismiss Topic',
      undoWorkspaceActionTitle: 'Undo Dismiss Topic'
    });

    expect(items.find((item) => item.id === APP_COMMAND_IDS.undo)).toMatchObject({
      enabled: true,
      title: 'Undo Dismiss Topic'
    });
    expect(items.find((item) => item.id === APP_COMMAND_IDS.redo)).toMatchObject({
      enabled: true,
      title: 'Redo Dismiss Topic'
    });
  });

  it('projects the current platform redo shortcut', () => {
    const items = buildAppPaletteItems({
      ...createPaletteOptions(false),
      canRedoWorkspaceAction: true,
      redoWorkspaceActionTitle: 'Redo Create Annotation'
    });

    expect(items.find((item) => item.id === APP_COMMAND_IDS.redo)?.shortcuts?.primary).toBeDefined();
  });

  it('omits the DevTools command when renderer dev entries are disabled', () => {
    const items = buildAppPaletteItems({
      ...createPaletteOptions(false),
      canToggleDevTools: false
    });

    expect(items.some((item) => item.id === APP_COMMAND_IDS.toggleDevTools)).toBe(false);
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

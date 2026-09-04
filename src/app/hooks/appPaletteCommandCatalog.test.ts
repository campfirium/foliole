import { beforeAll, describe, expect, it } from 'vitest';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { buildCommandMenuSections } from '../../shared/commands/menuModel';
import {
  preloadTranslationCatalog,
  translate,
  type TranslationKey
} from '../../shared/localization/translations';

import {
  type BuildAppPaletteItemsOptions,
  getAppPaletteCommands
} from './appPaletteCommandCatalog';

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
  canGoToLastChild: true,
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
  canToggleDevTools: true,
  canToggleDevReviewStatusBarPersistence: true,
  canRevealAnswer: true,
  canSetNodePriority: true,
  canScrollCurrentDocument: true,
  canToggleImmersiveMode: true,
  canToggleReviewMode: true,
  canUndoWorkspaceAction: true,
  isImmersiveMode: false,
  isDevReviewStatusBarPersistenceEnabled: false,
  isReviewMode: false,
  redoWorkspaceActionTitle: 'Redo',
  t: (key: TranslationKey) => translate('en', key),
  undoWorkspaceActionTitle: 'Undo'
};

function sectionFor(commandId: string) {
  return getAppPaletteCommands(enabledOptions).find((item) => item.id === commandId)?.section;
}

beforeAll(async () => {
  await Promise.all([preloadTranslationCatalog('en'), preloadTranslationCatalog('zh-Hans')]);
});

describe('getAppPaletteCommands localization', () => {
  it('keeps localized section titles ordered by stable section identity', () => {
    const items = getAppPaletteCommands({
      ...enabledOptions,
      t: (key) => translate('zh-Hans', key)
    });
    const sections = buildCommandMenuSections(items, [], '');

    expect(items.find((item) => item.id === APP_COMMAND_IDS.openCommandPalette)).toMatchObject({
      section: '工作区',
      sectionId: 'Workspace',
      title: '命令面板'
    });
    expect(items.find((item) => item.id === APP_COMMAND_IDS.goBack)?.title).toBe('后退');
    expect(items.find((item) => item.id === APP_COMMAND_IDS.goForward)?.title).toBe('前进');
    expect(items.find((item) => item.id === APP_COMMAND_IDS.goParent)?.title).toBe('返回上级');
    expect(items.find((item) => item.id === APP_COMMAND_IDS.publishToFoliole)?.title).toBe(
      'Publish to the site'
    );
    expect(sections.map((section) => section.title).slice(0, 4)).toEqual([
      '导航',
      '创建',
      '工作区',
      '编辑器'
    ]);
    expect(sections.flatMap((section) => section.items).map((item) => item.title)).not.toContain(
      'desktop.command.openCommandPalette'
    );
  });
});

describe('getAppPaletteCommands', () => {
  it('assigns creation commands to the Create section', () => {
    expect(sectionFor(APP_COMMAND_IDS.createTopic)).toBe('Create');
    expect(sectionFor(APP_COMMAND_IDS.createFolder)).toBe('Create');
  });

  it('names the site publishing target alongside the other destination commands', () => {
    expect(
      getAppPaletteCommands(enabledOptions).find(
        (item) => item.id === APP_COMMAND_IDS.publishToFoliole
      )?.title
    ).toBe('Publish to the site');
  });

  it('keeps command palette sections aligned with the information architecture', () => {
    expect(sectionFor(APP_COMMAND_IDS.toggleDevTools)).toBe('Developer');
    expect(sectionFor(APP_COMMAND_IDS.reimportSelectedTopic)).toBe('Developer');
    expect(sectionFor(APP_COMMAND_IDS.openPerformancePanel)).toBe('Developer');
    expect(sectionFor(APP_COMMAND_IDS.toggleDevReviewStatusBarPersistence)).toBe('Developer');
    expect(sectionFor(APP_COMMAND_IDS.enterPriorityMode)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.exportCurrentArticle)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.mergeHighlightsIntoTopic)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.splitTopic)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.repairTable)).toBe('Editor');
    expect(sectionFor(APP_COMMAND_IDS.openHelpSearch)).toBe('Workspace');
    expect(sectionFor(APP_COMMAND_IDS.openGuidedSample)).toBe('Workspace');
    expect(sectionFor(APP_COMMAND_IDS.openWorkspaceSearch)).toBe('Workspace');
    expect(sectionFor(APP_COMMAND_IDS.openCommandPalette)).toBe('Workspace');
    expect(sectionFor(APP_COMMAND_IDS.renameNode)).toBe('Workspace');
    expect(sectionFor(APP_COMMAND_IDS.setPdfDarkAppearanceWarm)).toBe('Settings');
  });

  it('omits the DevTools command outside renderer dev mode', () => {
    const items = getAppPaletteCommands({ ...enabledOptions, canToggleDevTools: false });

    expect(items.some((item) => item.id === APP_COMMAND_IDS.toggleDevTools)).toBe(false);
  });

  it('uses dynamic labels for the dev review status bar memory toggle', () => {
    expect(
      getAppPaletteCommands({
        ...enabledOptions,
        isDevReviewStatusBarPersistenceEnabled: false
      }).find((item) => item.id === APP_COMMAND_IDS.toggleDevReviewStatusBarPersistence)?.title
    ).toBe('DEV Enable Review Status Bar Memory');
    expect(
      getAppPaletteCommands({
        ...enabledOptions,
        isDevReviewStatusBarPersistenceEnabled: true
      }).find((item) => item.id === APP_COMMAND_IDS.toggleDevReviewStatusBarPersistence)?.title
    ).toBe('DEV Disable Review Status Bar Memory');
  });
});

describe('command palette help entries', () => {

  it('keeps help knowledge entries out of ordinary command results', () => {
    const items = getAppPaletteCommands(enabledOptions);
    const helpCommand = items.find((item) => item.id === APP_COMMAND_IDS.openHelpSearch);
    const relearnResults = buildCommandMenuSections(items, [], 'relearn').flatMap(
      (section) => section.items
    );
    const priorityResults = buildCommandMenuSections(items, [], 'priority').flatMap(
      (section) => section.items
    );

    expect(helpCommand).toMatchObject({ enabled: true, title: 'DEV Open Help Search' });
    expect(items.some((item) => item.id.startsWith('actionHelp.'))).toBe(false);
    expect(relearnResults.map((item) => item.title)).not.toContain('Relearn');
    expect(priorityResults.map((item) => item.title)).not.toContain('Relearn');
  });
});

describe('document scroll palette commands', () => {
  it('uses current-document availability', () => {
    const enabled = getAppPaletteCommands(enabledOptions);
    expect(enabled.find((item) => item.id === APP_COMMAND_IDS.scrollDocumentTop)).toMatchObject({
      enabled: true,
      section: 'Navigation'
    });
    const disabled = getAppPaletteCommands({ ...enabledOptions, canScrollCurrentDocument: false });
    expect(disabled.find((item) => item.id === APP_COMMAND_IDS.scrollDocumentBottom)?.enabled).toBe(false);
  });
});

import type { PdfReadingMode } from '../../features/settings/model/appearanceSettings';
import { DEFAULT_APP_COMMAND_SHORTCUTS } from '../../shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { CommandPaletteItem } from '../../shared/commands/types';
import { definedProps } from '../../shared/lib/definedProps';

import { getAppPaletteCommands, type BuildAppPaletteItemsOptions } from './appPaletteCommandCatalog';

interface RunAppCommandActions {
  undo: () => boolean | void;
  redo: () => boolean | void;
  importDirectory: () => void | Promise<void>;
  closeSettings: () => void;
  createFolder: () => void;
  createItem: () => void;
  createTopic: () => void;
  createVirtualNode: () => void;
  enterPriorityMode: () => void;
  exportCurrentArticle: () => void | Promise<void>;
  findInTopic: () => void;
  mergeHighlightsIntoTopic: () => void | Promise<void>;
  createSelectionHighlight: () => void;
  createSelectionCloze: () => void;
  addSelectionNote: () => void;
  repairTable: () => boolean | void;
  openImportManagement: () => void;
  goBack: () => void;
  goForward: () => void;
  goToNode: () => void;
  moveToNode: () => void;
  renameNode: () => void;
  goParent: () => void;
  toggleImmersiveMode: () => void;
  toggleDismissedTopicsVisibility: () => void;
  importSingleFile: () => void | Promise<void>;
  reimportSelectedTopic: () => void | Promise<void>;
  openPerformancePanel: () => void;
  resetImportData: () => boolean | void;
  toggleDevReviewStatusBarPersistence: () => void;
  startClipboardImport: () => void;
  openNotes: () => void;
  openHelpSearch: () => void;
  checkForUpdates: () => void | Promise<void>;
  openLatestRelease: () => void | Promise<void>;
  openGitHubRepository: () => void | Promise<void>;
  openGitHubIssues: () => void | Promise<void>;
  openGitHubDiscussions: () => void | Promise<void>;
  openReadwiseReaderSettings: () => void;
  openSettings: () => void;
  openTrash: () => void;
  restartApp: () => void;
  setPdfReadingMode: (value: PdfReadingMode) => void;
  toggleBaseColorMode: () => void;
  revealReviewAnswer: () => void;
  toggleReviewMode: () => void;
  toggleEditorDisplayMode: () => void;
  toggleList: () => void;
  toggleRightSidebar: () => void;
  toggleBothSidebars: () => void;
  gradeReviewAgain: () => void;
  gradeReviewHard: () => void;
  gradeReviewGood: () => void;
  gradeReviewEasy: () => void;
  readingReviewSoon: () => void;
  readingReviewLater: () => void;
  readingReviewPostpone?: () => void;
  readingReviewRead: () => void;
  readingReviewDismiss: () => void;
  reviewScrollReadingDown: () => boolean | void;
  reviewScrollReadingUp: () => boolean | void;
  deleteCurrentReviewItem: () => boolean | void;
  reviewNavigateParent: () => boolean | void;
  reviewNavigateBack: () => boolean | void;
  reviewNavigateForward: () => boolean | void;
  reviewNavigateDown: () => boolean | void;
  reviewNavigatePreviousSibling: () => boolean | void;
  reviewNavigateNextSibling: () => boolean | void;
  deleteReviewSourceTopic: () => boolean | void;
  toggleDevTools: () => void;
}

interface ReviewModeToggleActions {
  enterReviewMode: () => void;
  exitReviewMode: () => void;
}

type CommandActionResult = boolean | void | Promise<void>;

export function buildAppPaletteItems(options: BuildAppPaletteItemsOptions): CommandPaletteItem[] {
  return getAppPaletteCommands(options).map((command) => ({
    ...command,
    ...definedProps({
      shortcuts: DEFAULT_APP_COMMAND_SHORTCUTS[command.id as keyof typeof DEFAULT_APP_COMMAND_SHORTCUTS]
    })
  }));
}

export function runReviewModeToggle(isReviewMode: boolean, actions: ReviewModeToggleActions) {
  if (isReviewMode) {
    actions.exitReviewMode();
    return;
  }
  actions.enterReviewMode();
}

function createWorkspaceCommandHandlers(actions: RunAppCommandActions): Record<string, () => CommandActionResult> {
  return {
    [APP_COMMAND_IDS.undo]: actions.undo,
    [APP_COMMAND_IDS.redo]: actions.redo,
    [APP_COMMAND_IDS.createFolder]: actions.createFolder,
    [APP_COMMAND_IDS.createTopic]: actions.createTopic,
    [APP_COMMAND_IDS.createItem]: actions.createItem,
    [APP_COMMAND_IDS.createVirtualNode]: actions.createVirtualNode,
    [APP_COMMAND_IDS.importSingleFile]: actions.importSingleFile,
    [APP_COMMAND_IDS.importFolder]: actions.importDirectory,
    [APP_COMMAND_IDS.clipboardImport]: actions.startClipboardImport,
    [APP_COMMAND_IDS.openImportManagement]: actions.openImportManagement,
    [APP_COMMAND_IDS.resetImportData]: actions.resetImportData,
    [APP_COMMAND_IDS.openPerformancePanel]: actions.openPerformancePanel,
    [APP_COMMAND_IDS.toggleDevReviewStatusBarPersistence]: actions.toggleDevReviewStatusBarPersistence,
    [APP_COMMAND_IDS.reimportSelectedTopic]: actions.reimportSelectedTopic,
    [APP_COMMAND_IDS.openNotes]: actions.openNotes,
    [APP_COMMAND_IDS.openHelpSearch]: actions.openHelpSearch,
    [APP_COMMAND_IDS.checkForUpdates]: actions.checkForUpdates,
    [APP_COMMAND_IDS.openLatestRelease]: actions.openLatestRelease,
    [APP_COMMAND_IDS.openGitHubRepository]: actions.openGitHubRepository,
    [APP_COMMAND_IDS.openGitHubIssues]: actions.openGitHubIssues,
    [APP_COMMAND_IDS.openGitHubDiscussions]: actions.openGitHubDiscussions,
    [APP_COMMAND_IDS.openTrash]: actions.openTrash,
    [APP_COMMAND_IDS.exportCurrentArticle]: actions.exportCurrentArticle,
    [APP_COMMAND_IDS.enterPriorityMode]: actions.enterPriorityMode,
    [APP_COMMAND_IDS.findInTopic]: actions.findInTopic,
    [APP_COMMAND_IDS.mergeHighlightsIntoTopic]: actions.mergeHighlightsIntoTopic,
    [APP_COMMAND_IDS.createSelectionHighlight]: actions.createSelectionHighlight,
    [APP_COMMAND_IDS.createSelectionCloze]: actions.createSelectionCloze,
    [APP_COMMAND_IDS.addSelectionNote]: actions.addSelectionNote,
    [APP_COMMAND_IDS.repairTable]: actions.repairTable,
    [APP_COMMAND_IDS.restartApp]: actions.restartApp,
    [APP_COMMAND_IDS.toggleList]: actions.toggleList,
    [APP_COMMAND_IDS.toggleRightSidebar]: actions.toggleRightSidebar,
    [APP_COMMAND_IDS.toggleBothSidebars]: actions.toggleBothSidebars,
    [APP_COMMAND_IDS.toggleDevTools]: actions.toggleDevTools,
    [APP_COMMAND_IDS.openSettings]: actions.openSettings,
    [APP_COMMAND_IDS.openReadwiseReaderSettings]: actions.openReadwiseReaderSettings,
    [APP_COMMAND_IDS.setPdfDarkAppearanceOriginal]: () => actions.setPdfReadingMode('original'),
    [APP_COMMAND_IDS.setPdfDarkAppearanceInverted]: () => actions.setPdfReadingMode('inverted'),
    [APP_COMMAND_IDS.setPdfDarkAppearanceWarm]: () => actions.setPdfReadingMode('warm'),
    [APP_COMMAND_IDS.toggleBaseColorMode]: actions.toggleBaseColorMode,
    [APP_COMMAND_IDS.closeSettings]: actions.closeSettings
  };
}

function createNavigationCommandHandlers(actions: RunAppCommandActions): Record<string, () => CommandActionResult> {
  return {
    [APP_COMMAND_IDS.goBack]: actions.goBack,
    [APP_COMMAND_IDS.goForward]: actions.goForward,
    [APP_COMMAND_IDS.goToNode]: actions.goToNode,
    [APP_COMMAND_IDS.moveToNode]: actions.moveToNode,
    [APP_COMMAND_IDS.renameNode]: actions.renameNode,
    [APP_COMMAND_IDS.goParent]: actions.goParent,
    [APP_COMMAND_IDS.toggleImmersiveMode]: actions.toggleImmersiveMode,
    [APP_COMMAND_IDS.toggleDismissedTopicsVisibility]: actions.toggleDismissedTopicsVisibility,
    [APP_COMMAND_IDS.toggleEditorDisplayMode]: actions.toggleEditorDisplayMode
  };
}

function createReviewCommandHandlers(actions: RunAppCommandActions): Record<string, () => CommandActionResult> {
  return {
    [APP_COMMAND_IDS.startStudyMode]: actions.toggleReviewMode,
    [APP_COMMAND_IDS.revealReviewAnswer]: actions.revealReviewAnswer,
    [APP_COMMAND_IDS.gradeReviewAgain]: actions.gradeReviewAgain,
    [APP_COMMAND_IDS.gradeReviewHard]: actions.gradeReviewHard,
    [APP_COMMAND_IDS.gradeReviewGood]: actions.gradeReviewGood,
    [APP_COMMAND_IDS.gradeReviewEasy]: actions.gradeReviewEasy,
    [APP_COMMAND_IDS.readingReviewSoon]: actions.readingReviewSoon,
    [APP_COMMAND_IDS.readingReviewLater]: actions.readingReviewLater,
    [APP_COMMAND_IDS.readingReviewPostpone]: actions.readingReviewPostpone ?? (() => false),
    [APP_COMMAND_IDS.readingReviewRead]: actions.readingReviewRead,
    [APP_COMMAND_IDS.readingReviewDismiss]: actions.readingReviewDismiss,
    [APP_COMMAND_IDS.reviewScrollReadingDown]: actions.reviewScrollReadingDown,
    [APP_COMMAND_IDS.reviewScrollReadingUp]: actions.reviewScrollReadingUp,
    [APP_COMMAND_IDS.deleteCurrentReviewItem]: actions.deleteCurrentReviewItem,
    [APP_COMMAND_IDS.reviewNavigateParent]: actions.reviewNavigateParent,
    [APP_COMMAND_IDS.reviewNavigateBack]: actions.reviewNavigateBack,
    [APP_COMMAND_IDS.reviewNavigateForward]: actions.reviewNavigateForward,
    [APP_COMMAND_IDS.reviewNavigateDown]: actions.reviewNavigateDown,
    [APP_COMMAND_IDS.reviewNavigatePreviousSibling]: actions.reviewNavigatePreviousSibling,
    [APP_COMMAND_IDS.reviewNavigateNextSibling]: actions.reviewNavigateNextSibling,
    [APP_COMMAND_IDS.deleteReviewSourceTopic]: actions.deleteReviewSourceTopic
  };
}

export function runAppCommand(id: string, actions: RunAppCommandActions) {
  const handlers: Record<string, () => CommandActionResult> = {
    ...createWorkspaceCommandHandlers(actions),
    ...createNavigationCommandHandlers(actions),
    ...createReviewCommandHandlers(actions)
  };

  const handler = handlers[id];
  if (!handler) {
    return false;
  }
  const result = handler();
  return result !== false;
}

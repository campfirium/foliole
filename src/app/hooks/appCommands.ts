import { DEFAULT_APP_COMMAND_SHORTCUTS } from '../../shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { CommandPaletteItem } from '../../shared/commands/types';

import { getAppPaletteCommands, type BuildAppPaletteItemsOptions } from './appPaletteCommandCatalog';

interface RunAppCommandActions {
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
  openImportManagement: () => void;
  goBack: () => void;
  goForward: () => void;
  goToNode: () => void;
  moveToNode: () => void;
  renameNode: () => void;
  goParent: () => void;
  toggleImmersiveMode: () => void;
  importSingleFile: () => void | Promise<void>;
  reimportSelectedTopic: () => void | Promise<void>;
  resetImportData: () => boolean | void;
  startClipboardImport: () => void;
  openNotes: () => void;
  openReadwiseReaderSettings: () => void;
  openSettings: () => void;
  openTrash: () => void;
  restartApp: () => void;
  toggleBaseColorMode: () => void;
  revealReviewAnswer: () => void;
  toggleReviewMode: () => void;
  toggleEditorDisplayMode: () => void;
  toggleList: () => void;
  gradeReviewAgain: () => void;
  gradeReviewHard: () => void;
  gradeReviewGood: () => void;
  gradeReviewEasy: () => void;
  readingReviewLater: () => void;
  readingReviewRead: () => void;
  readingReviewDismiss: () => void;
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
    shortcuts: DEFAULT_APP_COMMAND_SHORTCUTS[command.id as keyof typeof DEFAULT_APP_COMMAND_SHORTCUTS]
  }));
}

export function runReviewModeToggle(isReviewMode: boolean, actions: ReviewModeToggleActions) {
  if (isReviewMode) {
    actions.exitReviewMode();
    return;
  }
  actions.enterReviewMode();
}

export function runAppCommand(id: string, actions: RunAppCommandActions) {
  const handlers: Record<string, () => CommandActionResult> = {
    [APP_COMMAND_IDS.createFolder]: actions.createFolder,
    [APP_COMMAND_IDS.createTopic]: actions.createTopic,
    [APP_COMMAND_IDS.createItem]: actions.createItem,
    [APP_COMMAND_IDS.createVirtualNode]: actions.createVirtualNode,
    [APP_COMMAND_IDS.importSingleFile]: actions.importSingleFile,
    [APP_COMMAND_IDS.importFolder]: actions.importDirectory,
    [APP_COMMAND_IDS.clipboardImport]: actions.startClipboardImport,
    [APP_COMMAND_IDS.openImportManagement]: actions.openImportManagement,
    [APP_COMMAND_IDS.resetImportData]: actions.resetImportData,
    [APP_COMMAND_IDS.reimportSelectedTopic]: actions.reimportSelectedTopic,
    [APP_COMMAND_IDS.openNotes]: actions.openNotes,
    [APP_COMMAND_IDS.openTrash]: actions.openTrash,
    [APP_COMMAND_IDS.exportCurrentArticle]: actions.exportCurrentArticle,
    [APP_COMMAND_IDS.enterPriorityMode]: actions.enterPriorityMode,
    [APP_COMMAND_IDS.findInTopic]: actions.findInTopic,
    [APP_COMMAND_IDS.mergeHighlightsIntoTopic]: actions.mergeHighlightsIntoTopic,
    [APP_COMMAND_IDS.restartApp]: actions.restartApp,
    [APP_COMMAND_IDS.toggleList]: actions.toggleList,
    [APP_COMMAND_IDS.toggleDevTools]: actions.toggleDevTools,
    [APP_COMMAND_IDS.openSettings]: actions.openSettings,
    [APP_COMMAND_IDS.openReadwiseReaderSettings]: actions.openReadwiseReaderSettings,
    [APP_COMMAND_IDS.toggleBaseColorMode]: actions.toggleBaseColorMode,
    [APP_COMMAND_IDS.closeSettings]: actions.closeSettings,
    [APP_COMMAND_IDS.goBack]: actions.goBack,
    [APP_COMMAND_IDS.goForward]: actions.goForward,
    [APP_COMMAND_IDS.goToNode]: actions.goToNode,
    [APP_COMMAND_IDS.moveToNode]: actions.moveToNode,
    [APP_COMMAND_IDS.renameNode]: actions.renameNode,
    [APP_COMMAND_IDS.goParent]: actions.goParent,
    [APP_COMMAND_IDS.toggleImmersiveMode]: actions.toggleImmersiveMode,
    [APP_COMMAND_IDS.toggleEditorDisplayMode]: actions.toggleEditorDisplayMode,
    [APP_COMMAND_IDS.startStudyMode]: actions.toggleReviewMode,
    [APP_COMMAND_IDS.revealReviewAnswer]: actions.revealReviewAnswer,
    [APP_COMMAND_IDS.gradeReviewAgain]: actions.gradeReviewAgain,
    [APP_COMMAND_IDS.gradeReviewHard]: actions.gradeReviewHard,
    [APP_COMMAND_IDS.gradeReviewGood]: actions.gradeReviewGood,
    [APP_COMMAND_IDS.gradeReviewEasy]: actions.gradeReviewEasy,
    [APP_COMMAND_IDS.readingReviewLater]: actions.readingReviewLater,
    [APP_COMMAND_IDS.readingReviewRead]: actions.readingReviewRead,
    [APP_COMMAND_IDS.readingReviewDismiss]: actions.readingReviewDismiss
  };

  const handler = handlers[id];
  if (!handler) {
    return false;
  }
  const result = handler();
  return result !== false;
}

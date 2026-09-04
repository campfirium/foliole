import {
  isContentRegionScaleCommandEnabled,
  isContentRegionScaleCommandId
} from '../../shared/commands/contentRegionScaleCommands';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { Translate } from '../../shared/localization/LocalizationProvider';

import { APP_PALETTE_COMMANDS } from './appPaletteCommandList';
import {
  localizePaletteCommandSection,
  localizePaletteCommandTitle,
  resolveImmersiveModePaletteTitle
} from './appPaletteCommandLocalization';
import {
  isDeveloperCommandEnabled,
  resolveDeveloperPaletteTitle
} from './appPaletteDeveloperCommands';
import { isHelpPaletteCommand } from './appPaletteHelpCommands';
import {
  isReviewCommandEnabled,
  type ReviewPaletteCommandOptions
} from './appPaletteReviewCommands';

export interface BuildAppPaletteItemsOptions extends ReviewPaletteCommandOptions {
  canRedoWorkspaceAction: boolean;
  canUndoWorkspaceAction: boolean;
  canExportCurrentArticle: boolean;
  canPublishToFoliole?: boolean;
  canPublishToDiscourse?: boolean;
  canPublishToWordPress?: boolean;
  canSplitCurrentTopic?: boolean;
  canImportFile: boolean;
  canImportFolder: boolean;
  canMergeHighlightsIntoTopic: boolean;
  canRepairTable: boolean;
  canAnnotateSelection: boolean;
  canRenameNode: boolean;
  canReimportSelectedTopic: boolean;
  canResetImportData: boolean;
  canToggleDevTools: boolean;
  canToggleDevReviewStatusBarPersistence: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoToLastChild: boolean;
  canGoToNode: boolean;
  canMoveToNode: boolean;
  canGoParent: boolean;
  canFindInCurrentTopic: boolean;
  canOpenComparisonView?: boolean;
  canToggleImmersiveMode: boolean;
  canSetNodePriority: boolean;
  canScrollCurrentDocument?: boolean;
  isImmersiveMode: boolean;
  isDevReviewStatusBarPersistenceEnabled: boolean;
  isReviewMode: boolean;
  redoWorkspaceActionTitle: string;
  t: Translate;
  undoWorkspaceActionTitle: string;
}

function resolveCommandTitle(id: string, title: string, t: Translate) {
  if (id !== APP_COMMAND_IDS.startStudyMode) {
    return localizePaletteCommandTitle(id, title, t);
  }
  return localizePaletteCommandTitle(id, title, t);
}

function resolvePaletteTitle(id: string, options: BuildAppPaletteItemsOptions, title: string) {
  if (id === APP_COMMAND_IDS.undo) {
    return options.undoWorkspaceActionTitle;
  }
  if (id === APP_COMMAND_IDS.redo) {
    return options.redoWorkspaceActionTitle;
  }
  if (id === APP_COMMAND_IDS.toggleImmersiveMode) {
    return resolveImmersiveModePaletteTitle(options.isImmersiveMode, options.t);
  }
  const developerTitle = resolveDeveloperPaletteTitle(id, options, options.t);
  if (developerTitle) return developerTitle;
  return resolveCommandTitle(id, title, options.t);
}

function isWorkspaceCommandEnabled(id: string, options: BuildAppPaletteItemsOptions) {
  if (isContentRegionScaleCommandId(id)) return isContentRegionScaleCommandEnabled(id);
  if (id === APP_COMMAND_IDS.undo) {
    return options.canUndoWorkspaceAction;
  }
  if (id === APP_COMMAND_IDS.redo) {
    return options.canRedoWorkspaceAction;
  }
  if (
    id === APP_COMMAND_IDS.openHelpSearch ||
    id === APP_COMMAND_IDS.openGuidedSample ||
    id === APP_COMMAND_IDS.openWorkspaceSearch ||
    id === APP_COMMAND_IDS.openCommandPalette ||
    id === APP_COMMAND_IDS.openLocalFile ||
    isHelpPaletteCommand(id) ||
    id === APP_COMMAND_IDS.openTrash ||
    id === APP_COMMAND_IDS.restartApp ||
    id === APP_COMMAND_IDS.toggleList ||
    id === APP_COMMAND_IDS.toggleRightSidebar ||
    id === APP_COMMAND_IDS.toggleBothSidebars
  ) {
    return true;
  }
  if (id === APP_COMMAND_IDS.toggleDevTools) {
    return options.canToggleDevTools;
  }
  if (id === APP_COMMAND_IDS.renameNode) {
    return options.canRenameNode;
  }
  return null;
}

function isImportCommandEnabled(id: string) {
  if (id === APP_COMMAND_IDS.importSingleFile) {
    return true;
  }
  if (id === APP_COMMAND_IDS.importFolder) {
    return true;
  }
  return null;
}

function isEditorCommandEnabled(id: string, options: BuildAppPaletteItemsOptions) {
  if (id === APP_COMMAND_IDS.exportCurrentArticle) {
    return options.canExportCurrentArticle;
  }
  if (id === APP_COMMAND_IDS.publishToFoliole) {
    return Boolean(options.canPublishToFoliole);
  }
  if (id === APP_COMMAND_IDS.publishToDiscourse) {
    return Boolean(options.canPublishToDiscourse);
  }
  if (id === APP_COMMAND_IDS.publishToWordPress) {
    return Boolean(options.canPublishToWordPress);
  }
  if (id === APP_COMMAND_IDS.splitTopic) {
    return Boolean(options.canSplitCurrentTopic);
  }
  if (id === APP_COMMAND_IDS.mergeHighlightsIntoTopic) {
    return options.canMergeHighlightsIntoTopic;
  }
  if (
    id === APP_COMMAND_IDS.createSelectionHighlight ||
    id === APP_COMMAND_IDS.createSelectionCloze ||
    id === APP_COMMAND_IDS.addSelectionNote
  ) {
    return options.canAnnotateSelection;
  }
  if (id === APP_COMMAND_IDS.findInTopic) {
    return options.canFindInCurrentTopic;
  }
  if (id === APP_COMMAND_IDS.toggleComparisonView) {
    return Boolean(options.canOpenComparisonView);
  }
  if (id === APP_COMMAND_IDS.toggleImmersiveMode) {
    return options.canToggleImmersiveMode;
  }
  if (id === APP_COMMAND_IDS.enterPriorityMode) {
    return options.canSetNodePriority;
  }
  if (id === APP_COMMAND_IDS.repairTable) {
    return options.canRepairTable;
  }
  if (id === APP_COMMAND_IDS.scrollDocumentTop || id === APP_COMMAND_IDS.scrollDocumentBottom) {
    return Boolean(options.canScrollCurrentDocument);
  }
  return null;
}

function isNavigationCommandEnabled(id: string, options: BuildAppPaletteItemsOptions) {
  if (id === APP_COMMAND_IDS.goBack) {
    return options.canGoBack;
  }
  if (id === APP_COMMAND_IDS.goForward) {
    return options.canGoForward;
  }
  if (id === APP_COMMAND_IDS.goToLastChild) {
    return options.canGoToLastChild;
  }
  if (id === APP_COMMAND_IDS.goToNode) {
    return options.canGoToNode;
  }
  if (id === APP_COMMAND_IDS.moveToNode) {
    return options.canMoveToNode;
  }
  if (id === APP_COMMAND_IDS.goParent) {
    return options.canGoParent;
  }
  return null;
}

function isPaletteCommandEnabled(id: string, options: BuildAppPaletteItemsOptions) {
  const enabled = [
    isWorkspaceCommandEnabled,
    isImportCommandEnabled,
    isEditorCommandEnabled,
    isNavigationCommandEnabled,
    isDeveloperCommandEnabled,
    isReviewCommandEnabled
  ].reduce<boolean | null>((current, resolver) => current ?? resolver(id, options), null);
  if (enabled !== null) {
    return enabled;
  }
  return true;
}

export function getAppPaletteCommands(options: BuildAppPaletteItemsOptions) {
  return APP_PALETTE_COMMANDS.filter(
    (command) => command.id !== APP_COMMAND_IDS.toggleDevTools || options.canToggleDevTools
  ).map((command) => ({
    ...command,
    enabled: isPaletteCommandEnabled(command.id, options),
    section: localizePaletteCommandSection(command.section, options.t),
    sectionId: command.section,
    title: resolvePaletteTitle(command.id, options, command.title)
  }));
}

import { FOLDER_TOPIC_ITEM_COMMANDS } from '../../../lib/core/nodes/folderTopicItemCommands';
import { VIRTUAL_NODE_COMMAND } from '../../../lib/core/nodes/virtualNodeCommands';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';

import {
  DEVELOPER_PALETTE_COMMANDS,
  isDeveloperCommandEnabled,
  resolveDeveloperPaletteTitle
} from './appPaletteDeveloperCommands';
import { isReviewCommandEnabled, REVIEW_PALETTE_COMMANDS, type ReviewPaletteCommandOptions } from './appPaletteReviewCommands';
import { SETTINGS_PALETTE_COMMANDS } from './appPaletteSettingsCommands';

export interface BuildAppPaletteItemsOptions extends ReviewPaletteCommandOptions {
  canRedoWorkspaceAction: boolean;
  canUndoWorkspaceAction: boolean;
  canExportCurrentArticle: boolean;
  canImportFile: boolean;
  canImportFolder: boolean;
  canMergeHighlightsIntoTopic: boolean;
  canRepairTable: boolean;
  canAnnotateSelection: boolean;
  canRenameNode: boolean;
  canReimportSelectedTopic: boolean;
  canResetImportData: boolean;
  canToggleDevReviewStatusBarPersistence: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoToNode: boolean;
  canMoveToNode: boolean;
  canGoParent: boolean;
  canFindInCurrentTopic: boolean;
  canToggleImmersiveMode: boolean;
  canSetNodePriority: boolean;
  isImmersiveMode: boolean;
  isDevReviewStatusBarPersistenceEnabled: boolean;
  isReviewMode: boolean;
  redoWorkspaceActionTitle: string;
  undoWorkspaceActionTitle: string;
}

interface AppPaletteCommandMeta {
  id: string;
  title: string;
  section: string;
  keywords?: string[];
}

const APP_PALETTE_COMMANDS: AppPaletteCommandMeta[] = [
  ...FOLDER_TOPIC_ITEM_COMMANDS.map((command) => ({
    id: command.appCommandId,
    title: command.paletteTitle,
    section: 'Create',
    keywords: ['create', command.kind]
  })),
  {
    id: VIRTUAL_NODE_COMMAND.appCommandId,
    title: VIRTUAL_NODE_COMMAND.paletteTitle,
    section: 'Create',
    keywords: ['create', 'virtual', 'saved', 'view']
  },
  { id: APP_COMMAND_IDS.undo, title: 'Undo', section: 'Workspace', keywords: ['undo', 'history'] },
  { id: APP_COMMAND_IDS.redo, title: 'Redo', section: 'Workspace', keywords: ['redo', 'history'] },
  { id: APP_COMMAND_IDS.importSingleFile, title: 'Import Files', section: 'Import', keywords: ['import', 'inbox', 'file', 'files'] },
  { id: APP_COMMAND_IDS.importFolder, title: 'Import Folder', section: 'Import', keywords: ['import', 'folder', 'directory', 'inbox'] },
  { id: APP_COMMAND_IDS.clipboardImport, title: 'Import Clipboard', section: 'Import', keywords: ['import', 'clipboard', 'paste'] },
  { id: APP_COMMAND_IDS.openImportManagement, title: 'Open Import Management', section: 'Import', keywords: ['import', 'manage', 'removed'] },
  ...DEVELOPER_PALETTE_COMMANDS,
  { id: APP_COMMAND_IDS.openTrash, title: 'Open Trash', section: 'Workspace' },
  { id: APP_COMMAND_IDS.renameNode, title: 'Rename', section: 'Workspace', keywords: ['rename', 'topic', 'folder'] },
  { id: APP_COMMAND_IDS.exportCurrentArticle, title: 'Export Current Topic', section: 'Editor', keywords: ['export', 'topic', 'article', 'mirror', 'markdown', 'save'] },
  {
    id: APP_COMMAND_IDS.mergeHighlightsIntoTopic,
    title: 'Merge Highlights',
    section: 'Editor',
    keywords: ['merge', 'highlights', 'topic', 'append', 'file']
  },
  { id: APP_COMMAND_IDS.createSelectionHighlight, title: 'Highlight Selection', section: 'Editor', keywords: ['highlight', 'selection', 'excerpt'] },
  { id: APP_COMMAND_IDS.createSelectionCloze, title: 'Cloze Selection', section: 'Editor', keywords: ['cloze', 'selection', 'item'] },
  { id: APP_COMMAND_IDS.addSelectionNote, title: 'Annotate Selection', section: 'Editor', keywords: ['highlight', 'selection', 'annotation'] },
  { id: APP_COMMAND_IDS.repairTable, title: 'Repair Table', section: 'Editor', keywords: ['markdown', 'table', 'repair'] },
  { id: APP_COMMAND_IDS.restartApp, title: 'Restart App', section: 'Workspace', keywords: ['restart', 'relaunch'] },
  { id: APP_COMMAND_IDS.toggleList, title: 'Toggle List', section: 'Workspace', keywords: ['sidebar'] },
  { id: APP_COMMAND_IDS.toggleDevTools, title: 'Toggle DevTools', section: 'Developer', keywords: ['developer', 'inspect'] },
  ...SETTINGS_PALETTE_COMMANDS,
  { id: APP_COMMAND_IDS.openHelpSearch, title: 'DEV Open Help Search', section: 'Workspace', keywords: ['help', 'search', 'guide'] },
  { id: APP_COMMAND_IDS.goBack, title: 'Go Back', section: 'Navigation' },
  { id: APP_COMMAND_IDS.goForward, title: 'Go Forward', section: 'Navigation' },
  { id: APP_COMMAND_IDS.goToNode, title: 'Go to…', section: 'Navigation', keywords: ['search', 'open', 'node', 'jump', 'folder', 'topic', 'item'] },
  { id: APP_COMMAND_IDS.moveToNode, title: 'Move to…', section: 'Navigation', keywords: ['move', 'reparent'] },
  { id: APP_COMMAND_IDS.goParent, title: 'Go to Parent', section: 'Navigation' },
  { id: APP_COMMAND_IDS.findInTopic, title: 'Find in Topic', section: 'Navigation', keywords: ['find', 'search', 'topic', 'document', 'text'] },
  { id: APP_COMMAND_IDS.toggleImmersiveMode, title: 'Toggle Immersive Reading', section: 'Editor', keywords: ['immersive', 'reading', 'focus', 'fullscreen'] },
  { id: APP_COMMAND_IDS.toggleDismissedTopicsVisibility, title: 'Toggle Topic Focus', section: 'Workspace', keywords: ['dismissed', 'topics', 'hide', 'show', 'focus'] },
  { id: APP_COMMAND_IDS.enterPriorityMode, title: 'Set Priority…', section: 'Editor', keywords: ['priority', 'queue', 'p0', 'p1', 'quick set'] },
  { id: APP_COMMAND_IDS.toggleEditorDisplayMode, title: 'Toggle Editor Display Mode', section: 'Editor' },
  ...REVIEW_PALETTE_COMMANDS
];

function resolveCommandTitle(id: string, title: string) {
  if (id !== APP_COMMAND_IDS.startStudyMode) {
    return title;
  }
  return 'Toggle Flow Mode';
}

function resolvePaletteTitle(id: string, options: BuildAppPaletteItemsOptions, title: string) {
  if (id === APP_COMMAND_IDS.undo) {
    return options.undoWorkspaceActionTitle;
  }
  if (id === APP_COMMAND_IDS.redo) {
    return options.redoWorkspaceActionTitle;
  }
  if (id === APP_COMMAND_IDS.toggleImmersiveMode) {
    return options.isImmersiveMode ? 'Exit Immersive Reading' : 'Enter Immersive Reading';
  }
  const developerTitle = resolveDeveloperPaletteTitle(id, options);
  if (developerTitle) return developerTitle;
  return resolveCommandTitle(id, title);
}

function isWorkspaceCommandEnabled(id: string, options: BuildAppPaletteItemsOptions) {
  if (id === APP_COMMAND_IDS.undo) {
    return options.canUndoWorkspaceAction;
  }
  if (id === APP_COMMAND_IDS.redo) {
    return options.canRedoWorkspaceAction;
  }
  if (
    id === APP_COMMAND_IDS.openHelpSearch ||
    id === APP_COMMAND_IDS.openTrash ||
    id === APP_COMMAND_IDS.restartApp ||
    id === APP_COMMAND_IDS.toggleList
  ) {
    return true;
  }
  if (id === APP_COMMAND_IDS.renameNode) {
    return options.canRenameNode;
  }
  return null;
}

function isImportCommandEnabled(id: string, options: BuildAppPaletteItemsOptions) {
  if (id === APP_COMMAND_IDS.importSingleFile) {
    return options.canImportFile;
  }
  if (id === APP_COMMAND_IDS.importFolder) {
    return options.canImportFolder;
  }
  return null;
}

function isEditorCommandEnabled(id: string, options: BuildAppPaletteItemsOptions) {
  if (id === APP_COMMAND_IDS.exportCurrentArticle) {
    return options.canExportCurrentArticle;
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
  if (id === APP_COMMAND_IDS.toggleImmersiveMode) {
    return options.canToggleImmersiveMode;
  }
  if (id === APP_COMMAND_IDS.enterPriorityMode) {
    return options.canSetNodePriority;
  }
  if (id === APP_COMMAND_IDS.repairTable) {
    return options.canRepairTable;
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

export function isPaletteCommandEnabled(id: string, options: BuildAppPaletteItemsOptions) {
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
  return APP_PALETTE_COMMANDS.map((command) => ({
    ...command,
    enabled: isPaletteCommandEnabled(command.id, options),
    title: resolvePaletteTitle(command.id, options, command.title)
  }));
}

import { FOLDER_TOPIC_ITEM_COMMANDS } from '../../../lib/core/nodes/folderTopicItemCommands';
import { DEFAULT_APP_COMMAND_SHORTCUTS } from '../../shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { CommandPaletteItem } from '../../shared/commands/types';

interface BuildAppPaletteItemsOptions {
  canImportFile: boolean;
  canImportFolder: boolean;
  canResetImportData: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoToNode: boolean;
  canMoveToNode: boolean;
  canGoParent: boolean;
  canRevealAnswer: boolean;
  canToggleReviewMode: boolean;
  canGradeReview: boolean;
  canDeferReadingReview: boolean;
  canCompleteReadingReview: boolean;
  canDismissReadingReview: boolean;
  isReviewMode: boolean;
}

interface RunAppCommandActions {
  importDirectory: () => void | Promise<void>;
  closeSettings: () => void;
  createFolder: () => void;
  createItem: () => void;
  createTopic: () => void;
  openImportManagement: () => void;
  goBack: () => void;
  goForward: () => void;
  goToNode: () => void;
  moveToNode: () => void;
  goParent: () => void;
  importSingleFile: () => void | Promise<void>;
  resetImportData: () => boolean | void;
  startClipboardImport: () => void;
  openNotes: () => void;
  openSettings: () => void;
  openTrash: () => void;
  restartApp: () => void;
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

interface AppPaletteCommandMeta {
  id: string;
  title: string;
  section: string;
  keywords?: string[];
}

type CommandActionResult = boolean | void | Promise<void>;

const APP_PALETTE_COMMANDS: AppPaletteCommandMeta[] = [
  ...FOLDER_TOPIC_ITEM_COMMANDS.map((command) => ({
    id: command.appCommandId,
    title: command.paletteTitle,
    section: 'Workspace',
    keywords: ['create', command.kind]
  })),
  {
    id: APP_COMMAND_IDS.importSingleFile,
    title: 'Import Files',
    section: 'Import',
    keywords: ['import', 'inbox', 'file', 'files']
  },
  {
    id: APP_COMMAND_IDS.importFolder,
    title: 'Import Folder',
    section: 'Import',
    keywords: ['import', 'folder', 'directory', 'inbox']
  },
  {
    id: APP_COMMAND_IDS.clipboardImport,
    title: 'Clipboard Import *',
    section: 'Import',
    keywords: ['import', 'clipboard', 'paste']
  },
  {
    id: APP_COMMAND_IDS.openImportManagement,
    title: 'Import Management',
    section: 'Import',
    keywords: ['import', 'management', 'sources', 'readwise', 'inbox']
  },
  {
    id: APP_COMMAND_IDS.resetImportData,
    title: 'DEV Reset Import Data',
    section: 'Developer',
    keywords: ['dev', 'debug', 'import', 'reset', 'clear', 'records']
  },
  { id: APP_COMMAND_IDS.openNotes, title: 'Open Notes', section: 'Workspace' },
  { id: APP_COMMAND_IDS.openTrash, title: 'Open Trash', section: 'Workspace' },
  { id: APP_COMMAND_IDS.restartApp, title: 'Restart App', section: 'Workspace', keywords: ['restart', 'relaunch'] },
  { id: APP_COMMAND_IDS.toggleList, title: 'Toggle List', section: 'Workspace', keywords: ['sidebar'] },
  { id: APP_COMMAND_IDS.toggleDevTools, title: 'Toggle DevTools', section: 'Workspace', keywords: ['developer', 'inspect'] },
  { id: APP_COMMAND_IDS.openSettings, title: 'Open Settings', section: 'Settings' },
  { id: APP_COMMAND_IDS.closeSettings, title: 'Close Settings', section: 'Settings' },
  { id: APP_COMMAND_IDS.goBack, title: 'Go Back', section: 'Navigation' },
  { id: APP_COMMAND_IDS.goForward, title: 'Go Forward', section: 'Navigation' },
  { id: APP_COMMAND_IDS.goToNode, title: 'Go to…', section: 'Navigation', keywords: ['search', 'open', 'node', 'jump', 'folder', 'topic', 'item'] },
  { id: APP_COMMAND_IDS.moveToNode, title: 'Move to', section: 'Navigation', keywords: ['move', 'reparent', 'node'] },
  { id: APP_COMMAND_IDS.goParent, title: 'Go Parent', section: 'Navigation' },
  { id: APP_COMMAND_IDS.toggleEditorDisplayMode, title: 'Toggle Editor Display Mode', section: 'Editor' },
  { id: APP_COMMAND_IDS.startStudyMode, title: 'Enter Review Mode', section: 'Review' },
  { id: APP_COMMAND_IDS.revealReviewAnswer, title: 'Reveal Review Answer', section: 'Review' },
  { id: APP_COMMAND_IDS.gradeReviewAgain, title: 'Grade Review: Again', section: 'Review', keywords: ['grade'] },
  { id: APP_COMMAND_IDS.gradeReviewHard, title: 'Grade Review: Hard', section: 'Review', keywords: ['grade'] },
  { id: APP_COMMAND_IDS.gradeReviewGood, title: 'Grade Review: Good', section: 'Review', keywords: ['grade'] },
  { id: APP_COMMAND_IDS.gradeReviewEasy, title: 'Grade Review: Easy', section: 'Review', keywords: ['grade'] },
  { id: APP_COMMAND_IDS.readingReviewLater, title: 'Reading: Later', section: 'Review', keywords: ['reading'] },
  { id: APP_COMMAND_IDS.readingReviewRead, title: 'Reading: Read', section: 'Review', keywords: ['reading'] },
  { id: APP_COMMAND_IDS.readingReviewDismiss, title: 'Reading: Dismiss', section: 'Review', keywords: ['reading'] }
];

function resolveCommandTitle(id: string, isReviewMode: boolean, title: string) {
  if (id !== APP_COMMAND_IDS.startStudyMode) {
    return title;
  }
  return isReviewMode ? 'Exit Review Mode' : 'Enter Review Mode';
}

function isCommandEnabled(id: string, options: BuildAppPaletteItemsOptions) {
  if (id === APP_COMMAND_IDS.importSingleFile) {
    return options.canImportFile;
  }
  if (id === APP_COMMAND_IDS.importFolder) {
    return options.canImportFolder;
  }
  if (id === APP_COMMAND_IDS.goBack) {
    return options.canGoBack;
  }
  if (id === APP_COMMAND_IDS.resetImportData) {
    return options.canResetImportData;
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
  if (id === APP_COMMAND_IDS.startStudyMode) {
    return options.canToggleReviewMode;
  }
  if (id === APP_COMMAND_IDS.revealReviewAnswer) {
    return options.canRevealAnswer;
  }
  if (
    id === APP_COMMAND_IDS.gradeReviewAgain ||
    id === APP_COMMAND_IDS.gradeReviewHard ||
    id === APP_COMMAND_IDS.gradeReviewGood ||
    id === APP_COMMAND_IDS.gradeReviewEasy
  ) {
    return options.canGradeReview;
  }
  if (id === APP_COMMAND_IDS.readingReviewLater) {
    return options.canDeferReadingReview;
  }
  if (id === APP_COMMAND_IDS.readingReviewRead) {
    return options.canCompleteReadingReview;
  }
  if (id === APP_COMMAND_IDS.readingReviewDismiss) {
    return options.canDismissReadingReview;
  }
  return true;
}

export function buildAppPaletteItems(options: BuildAppPaletteItemsOptions): CommandPaletteItem[] {
  return APP_PALETTE_COMMANDS.map((command) => ({
    id: command.id,
    title: resolveCommandTitle(command.id, options.isReviewMode, command.title),
    section: command.section,
    keywords: command.keywords,
    shortcuts: DEFAULT_APP_COMMAND_SHORTCUTS[command.id as keyof typeof DEFAULT_APP_COMMAND_SHORTCUTS],
    enabled: isCommandEnabled(command.id, options)
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
    [APP_COMMAND_IDS.importSingleFile]: actions.importSingleFile,
    [APP_COMMAND_IDS.importFolder]: actions.importDirectory,
    [APP_COMMAND_IDS.clipboardImport]: actions.startClipboardImport,
    [APP_COMMAND_IDS.openImportManagement]: actions.openImportManagement,
    [APP_COMMAND_IDS.resetImportData]: actions.resetImportData,
    [APP_COMMAND_IDS.openNotes]: actions.openNotes,
    [APP_COMMAND_IDS.openTrash]: actions.openTrash,
    [APP_COMMAND_IDS.restartApp]: actions.restartApp,
    [APP_COMMAND_IDS.toggleList]: actions.toggleList,
    [APP_COMMAND_IDS.toggleDevTools]: actions.toggleDevTools,
    [APP_COMMAND_IDS.openSettings]: actions.openSettings,
    [APP_COMMAND_IDS.closeSettings]: actions.closeSettings,
    [APP_COMMAND_IDS.goBack]: actions.goBack,
    [APP_COMMAND_IDS.goForward]: actions.goForward,
    [APP_COMMAND_IDS.goToNode]: actions.goToNode,
    [APP_COMMAND_IDS.moveToNode]: actions.moveToNode,
    [APP_COMMAND_IDS.goParent]: actions.goParent,
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

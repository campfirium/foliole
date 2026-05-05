import { FOLDER_TOPIC_ITEM_COMMANDS } from '../../../lib/core/nodes/folderTopicItemCommands';
import { VIRTUAL_NODE_COMMAND } from '../../../lib/core/nodes/virtualNodeCommands';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';

export interface BuildAppPaletteItemsOptions {
  canExportCurrentArticle: boolean;
  canImportFile: boolean;
  canImportFolder: boolean;
  canMergeHighlightsIntoTopic: boolean;
  canResetImportData: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  canGoToNode: boolean;
  canMoveToNode: boolean;
  canGoParent: boolean;
  canFindInCurrentTopic: boolean;
  canToggleImmersiveMode: boolean;
  resolvedBaseColorMode: 'dark' | 'light';
  canSetNodePriority: boolean;
  canRevealAnswer: boolean;
  canToggleReviewMode: boolean;
  canGradeReview: boolean;
  canDeferReadingReview: boolean;
  canCompleteReadingReview: boolean;
  canDismissReadingReview: boolean;
  isImmersiveMode: boolean;
  isReviewMode: boolean;
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
  { id: APP_COMMAND_IDS.importSingleFile, title: 'Import Files', section: 'Import', keywords: ['import', 'inbox', 'file', 'files'] },
  { id: APP_COMMAND_IDS.importFolder, title: 'Import Folder', section: 'Import', keywords: ['import', 'folder', 'directory', 'inbox'] },
  { id: APP_COMMAND_IDS.clipboardImport, title: 'Import Clipboard', section: 'Import', keywords: ['import', 'clipboard', 'paste'] },
  {
    id: APP_COMMAND_IDS.openImportManagement,
    title: 'Import Management',
    section: 'Import',
    keywords: ['import', 'management', 'sources', 'readwise', 'inbox']
  },
  { id: APP_COMMAND_IDS.resetImportData, title: 'DEV Reset Import Data', section: 'Developer', keywords: ['dev', 'debug', 'import', 'reset', 'clear', 'records'] },
  { id: APP_COMMAND_IDS.openTrash, title: 'Open Trash', section: 'Workspace' },
  { id: APP_COMMAND_IDS.exportCurrentArticle, title: 'Export Current Topic', section: 'Editor', keywords: ['export', 'topic', 'article', 'mirror', 'markdown', 'save'] },
  {
    id: APP_COMMAND_IDS.mergeHighlightsIntoTopic,
    title: 'Merge Highlights',
    section: 'Editor',
    keywords: ['merge', 'highlights', 'topic', 'append', 'file']
  },
  { id: APP_COMMAND_IDS.restartApp, title: 'Restart App', section: 'Workspace', keywords: ['restart', 'relaunch'] },
  { id: APP_COMMAND_IDS.toggleList, title: 'Toggle List', section: 'Workspace', keywords: ['sidebar'] },
  { id: APP_COMMAND_IDS.toggleDevTools, title: 'Toggle DevTools', section: 'Developer', keywords: ['developer', 'inspect'] },
  { id: APP_COMMAND_IDS.openSettings, title: 'Open Settings', section: 'Settings' },
  {
    id: APP_COMMAND_IDS.openReadwiseReaderSettings,
    title: 'Open Readwise Reader Settings',
    section: 'Settings',
    keywords: ['settings', 'readwise', 'reader', 'import', 'library']
  },
  {
    id: APP_COMMAND_IDS.toggleBaseColorMode,
    title: 'Toggle Light/Dark Mode',
    section: 'Settings',
    keywords: ['appearance', 'theme', 'dark', 'light', 'color', 'mode']
  },
  { id: APP_COMMAND_IDS.closeSettings, title: 'Close Settings', section: 'Settings' },
  { id: APP_COMMAND_IDS.goBack, title: 'Go Back', section: 'Navigation' },
  { id: APP_COMMAND_IDS.goForward, title: 'Go Forward', section: 'Navigation' },
  { id: APP_COMMAND_IDS.goToNode, title: 'Go to…', section: 'Navigation', keywords: ['search', 'open', 'node', 'jump', 'folder', 'topic', 'item'] },
  { id: APP_COMMAND_IDS.moveToNode, title: 'Move to…', section: 'Navigation', keywords: ['move', 'reparent'] },
  { id: APP_COMMAND_IDS.goParent, title: 'Go to Parent', section: 'Navigation' },
  { id: APP_COMMAND_IDS.findInTopic, title: 'Find in Topic', section: 'Navigation', keywords: ['find', 'search', 'topic', 'document', 'text'] },
  { id: APP_COMMAND_IDS.toggleImmersiveMode, title: 'Toggle Immersive Reading', section: 'Editor', keywords: ['immersive', 'reading', 'focus', 'fullscreen'] },
  { id: APP_COMMAND_IDS.enterPriorityMode, title: 'Set Priority…', section: 'Editor', keywords: ['priority', 'queue', 'p0', 'p1', 'quick set'] },
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

function resolvePaletteTitle(id: string, options: BuildAppPaletteItemsOptions, title: string) {
  if (id === APP_COMMAND_IDS.toggleImmersiveMode) {
    return options.isImmersiveMode ? 'Exit Immersive Reading' : 'Enter Immersive Reading';
  }
  if (id === APP_COMMAND_IDS.toggleBaseColorMode) {
    return options.resolvedBaseColorMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode';
  }
  return resolveCommandTitle(id, options.isReviewMode, title);
}

function isReviewGradeCommand(id: string) {
  return (
    id === APP_COMMAND_IDS.gradeReviewAgain ||
    id === APP_COMMAND_IDS.gradeReviewHard ||
    id === APP_COMMAND_IDS.gradeReviewGood ||
    id === APP_COMMAND_IDS.gradeReviewEasy
  );
}

export function isPaletteCommandEnabled(id: string, options: BuildAppPaletteItemsOptions) {
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
  if (id === APP_COMMAND_IDS.exportCurrentArticle) {
    return options.canExportCurrentArticle;
  }
  if (id === APP_COMMAND_IDS.mergeHighlightsIntoTopic) {
    return options.canMergeHighlightsIntoTopic;
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
  if (id === APP_COMMAND_IDS.findInTopic) {
    return options.canFindInCurrentTopic;
  }
  if (id === APP_COMMAND_IDS.toggleImmersiveMode) {
    return options.canToggleImmersiveMode;
  }
  if (id === APP_COMMAND_IDS.enterPriorityMode) {
    return options.canSetNodePriority;
  }
  if (id === APP_COMMAND_IDS.startStudyMode) {
    return options.canToggleReviewMode;
  }
  if (id === APP_COMMAND_IDS.revealReviewAnswer) {
    return options.canRevealAnswer;
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
  if (isReviewGradeCommand(id)) {
    return options.canGradeReview;
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

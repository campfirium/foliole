import { DEFAULT_APP_COMMAND_SHORTCUTS } from '../../shared/commands/defaultShortcuts';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { CommandPaletteItem } from '../../shared/commands/types';

interface BuildAppPaletteItemsOptions {
  canGoBack: boolean;
  canGoForward: boolean;
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
  closeSettings: () => void;
  goBack: () => void;
  goForward: () => void;
  goParent: () => void;
  openNotes: () => void;
  openSettings: () => void;
  openTrash: () => void;
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

const APP_PALETTE_COMMANDS: AppPaletteCommandMeta[] = [
  { id: APP_COMMAND_IDS.openNotes, title: 'Open Notes', section: 'Workspace' },
  { id: APP_COMMAND_IDS.openTrash, title: 'Open Trash', section: 'Workspace' },
  { id: APP_COMMAND_IDS.toggleList, title: 'Toggle List', section: 'Workspace', keywords: ['sidebar'] },
  { id: APP_COMMAND_IDS.toggleDevTools, title: 'Toggle DevTools', section: 'Workspace', keywords: ['developer', 'inspect'] },
  { id: APP_COMMAND_IDS.openSettings, title: 'Open Settings', section: 'Settings' },
  { id: APP_COMMAND_IDS.closeSettings, title: 'Close Settings', section: 'Settings' },
  { id: APP_COMMAND_IDS.goBack, title: 'Go Back', section: 'Navigation' },
  { id: APP_COMMAND_IDS.goForward, title: 'Go Forward', section: 'Navigation' },
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
  if (id === APP_COMMAND_IDS.goBack) {
    return options.canGoBack;
  }
  if (id === APP_COMMAND_IDS.goForward) {
    return options.canGoForward;
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
  const handlers: Record<string, () => void> = {
    [APP_COMMAND_IDS.openNotes]: actions.openNotes,
    [APP_COMMAND_IDS.openTrash]: actions.openTrash,
    [APP_COMMAND_IDS.toggleList]: actions.toggleList,
    [APP_COMMAND_IDS.toggleDevTools]: actions.toggleDevTools,
    [APP_COMMAND_IDS.openSettings]: actions.openSettings,
    [APP_COMMAND_IDS.closeSettings]: actions.closeSettings,
    [APP_COMMAND_IDS.goBack]: actions.goBack,
    [APP_COMMAND_IDS.goForward]: actions.goForward,
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
  handler();
  return true;
}

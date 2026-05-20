import type { CommandPaletteItem } from '../../shared/commands/types';

import { runAppCommand, runReviewModeToggle } from './appCommands';
import { enterReviewModeSession, type StartStudyModeOptions } from './reviewModeSessionActions';

interface PaletteCommandRunnerArgs {
  clearSettingsRequest: () => void;
  closeTrashView: () => void;
  createFolder: () => void;
  createItem: () => void;
  createSelectionCloze: () => void;
  createSelectionHighlight: () => void;
  createTopic: () => void;
  createVirtualNode: () => void;
  addSelectionNote: () => void;
  repairTable: () => boolean;
  enterPriorityMode: () => void;
  exportCurrentArticle: () => Promise<boolean>;
  findInTopic: () => void;
  mergeHighlightsIntoTopic: () => Promise<boolean>;
  exitReviewSession: () => void;
  exitStudyMode: () => void;
  goBack: () => void;
  goForward: () => void;
  goToNode: () => void;
  moveToNode: () => void;
  renameNode: () => void;
  goParent: () => void;
  gradeReviewCard: (grade: 1 | 2 | 3 | 4) => void;
  importDirectory: () => Promise<boolean>;
  importSingleFile: () => Promise<boolean>;
  reimportSelectedTopic: () => Promise<boolean>;
  resetImportData: () => Promise<boolean>;
  completeReviewItem: () => boolean;
  deleteCurrentReviewItem: () => boolean;
  deferReviewItem: () => boolean;
  dismissReviewItem: () => boolean;
  redoWorkspaceAction: () => boolean;
  isReviewMode: boolean;
  openImportManagement: () => void;
  openNotesView: () => void;
  onToggleEditorDisplayMode: () => void;
  onToggleImmersiveMode: () => void;
  onToggleDismissedTopicsVisibility: () => void;
  onToggleListVisibility: () => void;
  onRestartApp: () => void;
  onToggleBaseColorMode: () => void;
  onToggleDevTools: () => void;
  openReadwiseReaderSettings: () => void;
  openTrashView: () => void;
  paletteItems: CommandPaletteItem[];
  recordRecentCommand: (id: string) => void;
  revealReviewAnswer: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setGoToNodePaletteOpen: (open: boolean) => void;
  setIsMoveToNodePaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  startClipboardImport: () => void;
  startReviewSession: () => boolean;
  startStudyMode: (options?: StartStudyModeOptions) => void;
  trashViewOpen: boolean;
  undoWorkspaceAction: () => boolean;
}

function createPaletteSettingsActions(args: PaletteCommandRunnerArgs) {
  return {
    closeSettings: () => {
      args.setSettingsOpen(false);
      args.clearSettingsRequest();
    },
    openReadwiseReaderSettings: args.openReadwiseReaderSettings,
    openSettings: () => {
      args.clearSettingsRequest();
      args.setSettingsOpen(true);
    },
    toggleBaseColorMode: args.onToggleBaseColorMode
  };
}

function createPaletteReviewCommandActions(args: PaletteCommandRunnerArgs, toggleReviewMode: () => void) {
  return {
    deleteCurrentReviewItem: () => args.deleteCurrentReviewItem(),
    gradeReviewAgain: () => args.gradeReviewCard(1),
    gradeReviewHard: () => args.gradeReviewCard(2),
    gradeReviewGood: () => args.gradeReviewCard(3),
    gradeReviewEasy: () => args.gradeReviewCard(4),
    readingReviewDismiss: () => args.dismissReviewItem(),
    readingReviewLater: () => args.deferReviewItem(),
    readingReviewRead: () => args.completeReviewItem(),
    revealReviewAnswer: args.revealReviewAnswer,
    toggleReviewMode
  };
}

function createPaletteCommandActions(args: PaletteCommandRunnerArgs, toggleReviewMode: () => void) {
  return {
    ...createPaletteSettingsActions(args),
    ...createPaletteReviewCommandActions(args, toggleReviewMode),
    undo: () => args.undoWorkspaceAction(),
    redo: () => args.redoWorkspaceAction(),
    createFolder: args.createFolder,
    createItem: args.createItem,
    createSelectionCloze: args.createSelectionCloze,
    createSelectionHighlight: args.createSelectionHighlight,
    createTopic: args.createTopic,
    createVirtualNode: args.createVirtualNode,
    addSelectionNote: args.addSelectionNote,
    repairTable: args.repairTable,
    enterPriorityMode: args.enterPriorityMode,
    exportCurrentArticle: () => {
      void args.exportCurrentArticle();
    },
    findInTopic: args.findInTopic,
    mergeHighlightsIntoTopic: () => {
      void args.mergeHighlightsIntoTopic();
    },
    goBack: args.goBack,
    goForward: args.goForward,
    goToNode: () => args.setGoToNodePaletteOpen(true),
    moveToNode: () => args.setIsMoveToNodePaletteOpen(true),
    renameNode: args.renameNode,
    goParent: args.goParent,
    importDirectory: () => {
      void args.importDirectory();
    },
    importSingleFile: () => {
      void args.importSingleFile();
    },
    reimportSelectedTopic: () => {
      void args.reimportSelectedTopic();
    },
    openImportManagement: args.openImportManagement,
    resetImportData: () => {
      if (!window.confirm('Reset imported content and import records? This cannot be undone.')) {
        return false;
      }
      void args.resetImportData();
    },
    openNotes: args.closeTrashView,
    openTrash: () => (args.trashViewOpen ? args.closeTrashView() : args.openTrashView()),
    restartApp: args.onRestartApp,
    startClipboardImport: args.startClipboardImport,
    toggleEditorDisplayMode: args.onToggleEditorDisplayMode,
    toggleDismissedTopicsVisibility: args.onToggleDismissedTopicsVisibility,
    toggleImmersiveMode: args.onToggleImmersiveMode,
    toggleList: args.onToggleListVisibility,
    toggleDevTools: args.onToggleDevTools
  };
}

export function createPaletteCommandRunner(args: PaletteCommandRunnerArgs) {
  const toggleReviewMode = () =>
    runReviewModeToggle(args.isReviewMode, {
      enterReviewMode: () =>
        enterReviewModeSession({
          onReviewSessionStarted: args.openNotesView,
          startReviewSession: args.startReviewSession,
          startStudyMode: args.startStudyMode
        }),
      exitReviewMode: () => {
        args.exitReviewSession();
        args.exitStudyMode();
      }
    });

  return (id: string) => {
    const canRun = args.paletteItems.some((item) => item.id === id && item.enabled);
    if (!canRun) {
      return;
    }
    const handled = runAppCommand(id, createPaletteCommandActions(args, toggleReviewMode));
    if (!handled) {
      return;
    }
    args.recordRecentCommand(id);
    args.setCommandPaletteOpen(false);
  };
}

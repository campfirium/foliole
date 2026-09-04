import type { PdfReadingMode } from '../../features/settings/model/appearanceSettings';
import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import type { CommandPaletteItem } from '../../shared/commands/types';

import { runAppCommand } from './appCommands';
import { runDemoCommandPreview } from './appPaletteDemoCommand';
import {
  createPaletteEditorCommandActions,
  type PaletteEditorCommandRunnerArgs
} from './appPaletteEditorCommandActions';
import {
  createPaletteHelpCommandActions,
  type PaletteHelpCommandRunnerArgs
} from './appPaletteHelpCommandRunner';
import { runResetImportDataCommand } from './appPaletteResetImportCommand';
import { createPaletteSettingsActions } from './appPaletteSettingsCommandActions';
import { enterReviewModeSession, type StartStudyModeOptions } from './reviewModeSessionActions';
import { runReviewModeToggle } from './reviewModeToggle';

const FRESH_STATE_COMMAND_IDS: ReadonlySet<string> = new Set([
  APP_COMMAND_IDS.undo,
  APP_COMMAND_IDS.redo
]);
const CONTEXTUAL_COMMAND_IDS: ReadonlySet<string> = new Set([APP_COMMAND_IDS.reviewSourceUpdate]);

interface PaletteCommandRunnerArgs
  extends PaletteHelpCommandRunnerArgs, PaletteEditorCommandRunnerArgs {
  clearSettingsRequest: () => void;
  closeTrashView: () => void;
  createFolder: () => void;
  createItem: () => void;
  createTopic: () => void;
  createVirtualFolder: () => void;
  exitReviewSession: () => void;
  exitStudyMode: () => void;
  goBack: () => void;
  goForward: () => void;
  scrollDocumentBottom: () => boolean | void;
  scrollDocumentTop: () => boolean | void;
  goToLastChild: () => void;
  goToNode: () => void;
  moveToNode: () => void;
  renameNode: () => void;
  goParent: () => void;
  gradeReviewCard: (grade: 1 | 2 | 3 | 4) => void;
  importDirectory: () => Promise<boolean>;
  importSingleFile: () => void;
  openLocalFile?: () => void | Promise<void>;
  reimportSelectedTopic: () => Promise<boolean>;
  resetImportData: () => Promise<boolean>;
  toggleDevReviewStatusBarPersistence: () => void;
  readReviewTopic: () => Promise<boolean>;
  deleteCurrentReviewItem: () => boolean;
  deleteReviewSourceTopic: () => boolean;
  demoOperationTranslate: Parameters<typeof runDemoCommandPreview>[1];
  postponeReviewTopic: () => Promise<boolean>;
  openPostponeTopicPanel: () => void;
  dismissReviewTopic: () => Promise<boolean>;
  revisitReviewTopicSoon: () => Promise<boolean>;
  redoWorkspaceAction: () => boolean;
  isReviewMode: boolean;
  openPerformancePanel: () => void;
  openSplitTopicDialog: () => boolean | void | Promise<boolean | void>;
  openGuidedSample: () => Promise<boolean>;
  openNotesView: () => void;
  onToggleEditorDisplayMode: () => void;
  onToggleImmersiveMode: () => void;
  onToggleDismissedTopicsVisibility: () => void;
  onToggleBothSidebarVisibility: () => void;
  onToggleListVisibility: () => void;
  onToggleRightSidebarVisibility: () => void;
  onOpenHelpSearch: () => void;
  onOpenWorkspaceSearch: () => void;
  onOpenCommandPalette: () => void;
  onSendFeedback: () => void;
  onRestartApp: () => void;
  onSetPdfReadingMode: (value: PdfReadingMode) => void;
  onToggleBaseColorMode: () => void;
  onToggleDevTools: () => void;
  openReadwiseReaderSettings: () => void;
  openTrashView: () => void;
  paletteItems: CommandPaletteItem[];
  recordRecentCommand: (id: string) => void;
  revealReviewAnswer: () => void;
  reviewNavigateDown: () => boolean;
  reviewNavigateNextSibling: () => boolean;
  reviewNavigateParent: () => boolean;
  reviewNavigatePreviousSibling: () => boolean;
  reviewScrollReadingDown: () => boolean;
  reviewScrollReadingUp: () => boolean;
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

function createPaletteReviewCommandActions(
  args: PaletteCommandRunnerArgs,
  toggleReviewMode: () => void
) {
  return {
    deleteCurrentReviewItem: () => args.deleteCurrentReviewItem(),
    deleteReviewSourceTopic: () => args.deleteReviewSourceTopic(),
    gradeReviewAgain: () => args.gradeReviewCard(1),
    gradeReviewHard: () => args.gradeReviewCard(2),
    gradeReviewGood: () => args.gradeReviewCard(3),
    gradeReviewEasy: () => args.gradeReviewCard(4),
    readingReviewDismiss: () => void args.dismissReviewTopic(),
    readingReviewLater: () => void args.postponeReviewTopic(),
    readingReviewPostpone: args.openPostponeTopicPanel,
    readingReviewRead: () => void args.readReviewTopic(),
    readingReviewSoon: () => void args.revisitReviewTopicSoon(),
    revealReviewAnswer: args.revealReviewAnswer,
    reviewNavigateBack: args.goBack,
    reviewNavigateDown: args.reviewNavigateDown,
    reviewNavigateForward: args.goForward,
    reviewNavigateNextSibling: args.reviewNavigateNextSibling,
    reviewNavigateParent: args.reviewNavigateParent,
    reviewNavigatePreviousSibling: args.reviewNavigatePreviousSibling,
    reviewScrollReadingDown: args.reviewScrollReadingDown,
    reviewScrollReadingUp: args.reviewScrollReadingUp,
    toggleReviewMode
  };
}

function createPaletteCommandActions(args: PaletteCommandRunnerArgs, toggleReviewMode: () => void) {
  return {
    ...createPaletteSettingsActions(args),
    ...createPaletteReviewCommandActions(args, toggleReviewMode),
    ...createPaletteEditorCommandActions(args),
    undo: () => args.undoWorkspaceAction(),
    redo: () => args.redoWorkspaceAction(),
    createFolder: args.createFolder,
    createItem: args.createItem,
    createSelectionCloze: args.createSelectionCloze,
    createSelectionHighlight: args.createSelectionHighlight,
    createTopic: args.createTopic,
    createVirtualFolder: args.createVirtualFolder,
    goBack: args.goBack,
    goForward: args.goForward,
    ...createDocumentScrollActions(args),
    goToLastChild: args.goToLastChild,
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
    openLocalFile: () => {
      void args.openLocalFile?.();
    },
    reimportSelectedTopic: () => {
      void args.reimportSelectedTopic();
    },
    openPerformancePanel: args.openPerformancePanel,
    splitTopic: () => {
      void args.openSplitTopicDialog();
    },
    resetImportData: () => runResetImportDataCommand(args),
    toggleDevReviewStatusBarPersistence: args.toggleDevReviewStatusBarPersistence,
    openGuidedSample: () => {
      void args.openGuidedSample();
    },
    openNotes: args.closeTrashView,
    openHelpSearch: args.onOpenHelpSearch,
    openWorkspaceSearch: args.onOpenWorkspaceSearch,
    openCommandPalette: args.onOpenCommandPalette,
    sendFeedback: args.onSendFeedback,
    ...createPaletteHelpCommandActions(args),
    openTrash: () => (args.trashViewOpen ? args.closeTrashView() : args.openTrashView()),
    restartApp: args.onRestartApp,
    startClipboardImport: args.startClipboardImport,
    toggleEditorDisplayMode: args.onToggleEditorDisplayMode,
    toggleDismissedTopicsVisibility: args.onToggleDismissedTopicsVisibility,
    toggleImmersiveMode: args.onToggleImmersiveMode,
    toggleList: args.onToggleListVisibility,
    toggleRightSidebar: args.onToggleRightSidebarVisibility,
    toggleBothSidebars: args.onToggleBothSidebarVisibility,
    toggleDevTools: args.onToggleDevTools
  };
}

function createDocumentScrollActions(args: PaletteCommandRunnerArgs) {
  return {
    scrollDocumentBottom: args.scrollDocumentBottom,
    scrollDocumentTop: args.scrollDocumentTop
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
    const canRun =
      FRESH_STATE_COMMAND_IDS.has(id) ||
      CONTEXTUAL_COMMAND_IDS.has(id) ||
      args.paletteItems.some((item) => item.id === id && item.enabled);
    if (!canRun) {
      return;
    }
    if (runDemoCommandPreview(id, args.demoOperationTranslate)) {
      args.setCommandPaletteOpen(false);
      return;
    }
    const handled = runAppCommand(id, createPaletteCommandActions(args, toggleReviewMode));
    if (!handled) {
      return;
    }
    args.recordRecentCommand(id);
    if (id !== APP_COMMAND_IDS.openCommandPalette) {
      args.setCommandPaletteOpen(false);
    }
  };
}

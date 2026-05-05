import type { CommandPaletteItem } from '../../shared/commands/types';

import { runAppCommand, runReviewModeToggle } from './appCommands';

interface PaletteCommandRunnerArgs {
  closeTrashView: () => void;
  exitReviewSession: () => void;
  exitStudyMode: () => void;
  goBack: () => void;
  goForward: () => void;
  goToNode: () => void;
  moveToNode: () => void;
  goParent: () => void;
  gradeReviewCard: (grade: 1 | 2 | 3 | 4) => void;
  importDirectory: () => Promise<boolean>;
  importSingleFile: () => Promise<boolean>;
  resetImportData: () => Promise<boolean>;
  completeReviewItem: () => boolean;
  deferReviewItem: () => boolean;
  dismissReviewItem: () => boolean;
  isReviewMode: boolean;
  openImportManagement: () => void;
  onToggleEditorDisplayMode: () => void;
  onToggleListVisibility: () => void;
  onRestartApp: () => void;
  onToggleDevTools: () => void;
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
  startStudyMode: () => void;
  trashViewOpen: boolean;
}

export function createPaletteCommandRunner(args: PaletteCommandRunnerArgs) {
  const toggleReviewMode = () =>
    runReviewModeToggle(args.isReviewMode, {
      enterReviewMode: () => args.startReviewSession() && args.startStudyMode(),
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
    const handled = runAppCommand(id, {
      closeSettings: () => args.setSettingsOpen(false),
      goBack: args.goBack,
      goForward: args.goForward,
      goToNode: () => args.setGoToNodePaletteOpen(true),
      moveToNode: () => args.setIsMoveToNodePaletteOpen(true),
      goParent: args.goParent,
      importDirectory: () => {
        void args.importDirectory();
      },
      importSingleFile: () => {
        void args.importSingleFile();
      },
      openImportManagement: args.openImportManagement,
      resetImportData: () => {
        if (!window.confirm('Reset imported content and import records? This cannot be undone.')) {
          return false;
        }
        void args.resetImportData();
      },
      openNotes: args.closeTrashView,
      openSettings: () => args.setSettingsOpen(true),
      openTrash: () => (args.trashViewOpen ? args.closeTrashView() : args.openTrashView()),
      restartApp: args.onRestartApp,
      revealReviewAnswer: args.revealReviewAnswer,
      startClipboardImport: args.startClipboardImport,
      toggleReviewMode,
      toggleEditorDisplayMode: args.onToggleEditorDisplayMode,
      toggleList: args.onToggleListVisibility,
      toggleDevTools: args.onToggleDevTools,
      gradeReviewAgain: () => args.gradeReviewCard(1),
      gradeReviewHard: () => args.gradeReviewCard(2),
      gradeReviewGood: () => args.gradeReviewCard(3),
      gradeReviewEasy: () => args.gradeReviewCard(4),
      readingReviewLater: () => args.deferReviewItem(),
      readingReviewRead: () => args.completeReviewItem(),
      readingReviewDismiss: () => args.dismissReviewItem()
    });
    if (!handled) {
      return;
    }
    args.recordRecentCommand(id);
    args.setCommandPaletteOpen(false);
  };
}

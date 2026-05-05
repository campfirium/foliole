import type { CommandPaletteItem } from '../../shared/commands/types';

import { runAppCommand, runReviewModeToggle } from './appCommands';

interface PaletteCommandRunnerArgs {
  closeTrashView: () => void;
  exitReviewSession: () => void;
  exitStudyMode: () => void;
  goBack: () => void;
  goForward: () => void;
  goParent: () => void;
  gradeReviewCard: (grade: 1 | 2 | 3 | 4) => void;
  isReviewMode: boolean;
  onToggleEditorDisplayMode: () => void;
  onToggleListVisibility: () => void;
  openTrashView: () => void;
  paletteItems: CommandPaletteItem[];
  recordRecentCommand: (id: string) => void;
  revealReviewAnswer: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
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
      goParent: args.goParent,
      openNotes: args.closeTrashView,
      openSettings: () => args.setSettingsOpen(true),
      openTrash: () => (args.trashViewOpen ? args.closeTrashView() : args.openTrashView()),
      revealReviewAnswer: args.revealReviewAnswer,
      toggleReviewMode,
      toggleEditorDisplayMode: args.onToggleEditorDisplayMode,
      toggleList: args.onToggleListVisibility,
      gradeReviewAgain: () => args.gradeReviewCard(1),
      gradeReviewHard: () => args.gradeReviewCard(2),
      gradeReviewGood: () => args.gradeReviewCard(3),
      gradeReviewEasy: () => args.gradeReviewCard(4)
    });
    if (!handled) {
      return;
    }
    args.recordRecentCommand(id);
    args.setCommandPaletteOpen(false);
  };
}

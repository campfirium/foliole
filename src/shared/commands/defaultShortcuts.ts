import { APP_COMMAND_IDS, type AppCommandId } from './ids';
import type { CommandShortcutSet } from './types';

export type DefaultCommandShortcuts = Partial<Record<AppCommandId, CommandShortcutSet>>;

export const DEFAULT_APP_COMMAND_SHORTCUTS: DefaultCommandShortcuts = {
  [APP_COMMAND_IDS.toggleCommandPaletteMac]: { primary: { key: 'p', metaKey: true } },
  [APP_COMMAND_IDS.toggleCommandPaletteWin]: { primary: { key: 'p', ctrlKey: true } },
  [APP_COMMAND_IDS.closeCommandPalette]: { primary: { key: 'Escape' } },
  [APP_COMMAND_IDS.closeSettings]: { primary: { key: 'Escape' } },
  [APP_COMMAND_IDS.closeContextMenu]: { primary: { key: 'Escape' } },
  [APP_COMMAND_IDS.undo]: { primary: { key: 'z', ctrlKey: true }, secondary: { key: 'z', metaKey: true } },
  [APP_COMMAND_IDS.redo]: {
    primary: { key: 'z', ctrlKey: true, shiftKey: true },
    secondary: { key: 'z', metaKey: true, shiftKey: true },
    tertiary: { key: 'y', ctrlKey: true }
  },
  [APP_COMMAND_IDS.goBack]: { primary: { key: 'ArrowLeft', altKey: true } },
  [APP_COMMAND_IDS.goForward]: { primary: { key: 'ArrowRight', altKey: true } },
  [APP_COMMAND_IDS.renameNode]: { primary: { key: 'F2' } },
  [APP_COMMAND_IDS.createFolder]: { primary: { key: 'f', ctrlKey: true, altKey: true }, secondary: { key: 'f', metaKey: true, altKey: true } },
  [APP_COMMAND_IDS.createTopic]: { primary: { key: 't', ctrlKey: true, altKey: true }, secondary: { key: 't', metaKey: true, altKey: true } },
  [APP_COMMAND_IDS.createItem]: { primary: { key: 'i', ctrlKey: true, altKey: true }, secondary: { key: 'e', metaKey: true, altKey: true } },
  [APP_COMMAND_IDS.findInTopic]: { primary: { key: 'f', ctrlKey: true }, secondary: { key: 'f', metaKey: true } },
  [APP_COMMAND_IDS.createSelectionHighlight]: { primary: { key: 'z', altKey: true } },
  [APP_COMMAND_IDS.createSelectionCloze]: { primary: { key: 'x', altKey: true } },
  [APP_COMMAND_IDS.addSelectionNote]: { primary: { key: 'a', altKey: true } },
  [APP_COMMAND_IDS.enterPriorityMode]: { primary: { key: 'm', ctrlKey: true }, secondary: { key: 'm', metaKey: true } },
  [APP_COMMAND_IDS.toggleEditorDisplayMode]: { primary: { key: '\\', ctrlKey: true }, secondary: { key: '\\', metaKey: true } },
  [APP_COMMAND_IDS.toggleImmersiveMode]: { primary: { key: 'F11' } },
  [APP_COMMAND_IDS.toggleDevTools]: { primary: { key: 'i', ctrlKey: true, shiftKey: true }, secondary: { key: 'i', metaKey: true, altKey: true } },
  [APP_COMMAND_IDS.toggleList]: { primary: { key: 'l', ctrlKey: true, shiftKey: true }, secondary: { key: 'l', metaKey: true, shiftKey: true } },
  [APP_COMMAND_IDS.startStudyMode]: { primary: { key: 'r', altKey: true }, secondary: { key: 'F1' } },
  [APP_COMMAND_IDS.revealReviewAnswer]: { primary: { key: ' ' } },
  [APP_COMMAND_IDS.gradeReviewAgain]: { primary: { key: '1' } },
  [APP_COMMAND_IDS.gradeReviewHard]: { primary: { key: '2' } },
  [APP_COMMAND_IDS.gradeReviewGood]: { primary: { key: '3' }, secondary: { key: ' ' } },
  [APP_COMMAND_IDS.gradeReviewEasy]: { primary: { key: '4' } },
  [APP_COMMAND_IDS.readingReviewLater]: { primary: { key: 'q' }, secondary: { key: '1' } },
  [APP_COMMAND_IDS.readingReviewRead]: { primary: { key: 'w' }, secondary: { key: ' ' }, tertiary: { key: '3' } },
  [APP_COMMAND_IDS.readingReviewDismiss]: { primary: { key: 'e' }, secondary: { key: '4' } },
  [APP_COMMAND_IDS.deleteCurrentReviewItem]: { primary: { key: 'Delete' } }
};

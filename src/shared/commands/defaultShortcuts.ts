import { APP_COMMAND_IDS, type AppCommandId } from './ids';
import type { CommandShortcut } from './types';

export type DefaultCommandShortcuts = Partial<Record<AppCommandId, CommandShortcut>>;

export const DEFAULT_APP_COMMAND_SHORTCUTS: DefaultCommandShortcuts = {
  [APP_COMMAND_IDS.toggleCommandPaletteMac]: { key: 'p', metaKey: true },
  [APP_COMMAND_IDS.toggleCommandPaletteWin]: { key: 'p', ctrlKey: true },
  [APP_COMMAND_IDS.closeCommandPalette]: { key: 'Escape' },
  [APP_COMMAND_IDS.closeSettings]: { key: 'Escape' },
  [APP_COMMAND_IDS.closeContextMenu]: { key: 'Escape' },
  [APP_COMMAND_IDS.goBack]: { key: 'ArrowLeft', altKey: true },
  [APP_COMMAND_IDS.goForward]: { key: 'ArrowRight', altKey: true },
  [APP_COMMAND_IDS.revealReviewAnswer]: { key: ' ', shiftKey: true },
  [APP_COMMAND_IDS.gradeReviewAgain]: { key: '1' },
  [APP_COMMAND_IDS.gradeReviewHard]: { key: '2' },
  [APP_COMMAND_IDS.gradeReviewGood]: { key: '3' },
  [APP_COMMAND_IDS.gradeReviewEasy]: { key: '4' }
};

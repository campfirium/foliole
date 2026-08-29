import { getDefaultGlobalCaptureAccelerator } from '../../../lib/platform/globalCaptureShortcut';

import type { DefaultCommandShortcuts } from './defaultShortcuts';
import { APP_COMMAND_IDS } from './ids';
import { parseShortcutLabel } from './shortcuts';

const globalCaptureShortcut = parseShortcutLabel(
  getDefaultGlobalCaptureAccelerator('darwin') ?? ''
)!;

export const MACOS_DEFAULT_APP_COMMAND_SHORTCUTS: DefaultCommandShortcuts = {
  [APP_COMMAND_IDS.toggleCommandPaletteMac]: { primary: { key: 'p', metaKey: true, shiftKey: true } },
  [APP_COMMAND_IDS.openCommandPalette]: { primary: { key: 'p', metaKey: true, shiftKey: true } },
  [APP_COMMAND_IDS.openWorkspaceSearch]: { primary: { key: 'f', metaKey: true, shiftKey: true } },
  [APP_COMMAND_IDS.closeCommandPalette]: { primary: { key: 'Escape' } },
  [APP_COMMAND_IDS.closeSettings]: { primary: { key: 'Escape' } },
  [APP_COMMAND_IDS.closeContextMenu]: { primary: { key: 'Escape' } },
  [APP_COMMAND_IDS.increaseContentRegionScale]: { primary: { key: '=', metaKey: true }, secondary: { key: '+', metaKey: true, shiftKey: true } },
  [APP_COMMAND_IDS.decreaseContentRegionScale]: { primary: { key: '-', metaKey: true } },
  [APP_COMMAND_IDS.resetContentRegionScale]: { primary: { key: '0', metaKey: true } },
  [APP_COMMAND_IDS.undo]: { primary: { key: 'z', metaKey: true } },
  [APP_COMMAND_IDS.redo]: { primary: { key: 'z', metaKey: true, shiftKey: true } },
  [APP_COMMAND_IDS.goBack]: { primary: { key: 'ArrowLeft', metaKey: true } },
  [APP_COMMAND_IDS.goForward]: { primary: { key: 'ArrowRight', metaKey: true } },
  [APP_COMMAND_IDS.goParent]: { primary: { key: 'ArrowUp', metaKey: true } },
  [APP_COMMAND_IDS.goToLastChild]: { primary: { key: 'ArrowDown', metaKey: true } },
  [APP_COMMAND_IDS.renameNode]: { primary: { key: 'F2' } },
  [APP_COMMAND_IDS.createFolder]: { primary: { key: 'n', metaKey: true, shiftKey: true } },
  [APP_COMMAND_IDS.createTopic]: { primary: { key: 'n', metaKey: true } },
  [APP_COMMAND_IDS.createItem]: { primary: { key: 'n', metaKey: true, altKey: true } },
  [APP_COMMAND_IDS.openLocalFile]: { primary: { key: 'o', metaKey: true } },
  [APP_COMMAND_IDS.globalCaptureToInbox]: { primary: globalCaptureShortcut },
  [APP_COMMAND_IDS.findInTopic]: { primary: { key: 'f', metaKey: true } },
  [APP_COMMAND_IDS.toggleEditorDisplayMode]: { primary: { key: '\\', metaKey: true } },
  [APP_COMMAND_IDS.toggleImmersiveMode]: { primary: { key: 'F11' } },
  [APP_COMMAND_IDS.toggleDevTools]: { primary: { key: 'i', metaKey: true, altKey: true } },
  [APP_COMMAND_IDS.toggleList]: { primary: { key: 'l', metaKey: true, shiftKey: true } },
  [APP_COMMAND_IDS.revealReviewAnswer]: { primary: { key: 'f' } },
  [APP_COMMAND_IDS.gradeReviewAgain]: { primary: { key: '1' } },
  [APP_COMMAND_IDS.gradeReviewHard]: { primary: { key: '2' } },
  [APP_COMMAND_IDS.gradeReviewGood]: { primary: { key: 'f' }, secondary: { key: '3' } },
  [APP_COMMAND_IDS.gradeReviewEasy]: { primary: { key: '4' } },
  [APP_COMMAND_IDS.readingReviewSoon]: { primary: { key: '1' } },
  [APP_COMMAND_IDS.readingReviewLater]: { primary: { key: '2' } },
  [APP_COMMAND_IDS.readingReviewPostpone]: { primary: { key: 'j', metaKey: true } },
  [APP_COMMAND_IDS.readingReviewRead]: { primary: { key: 'f' }, secondary: { key: '3' } },
  [APP_COMMAND_IDS.readingReviewDismiss]: { primary: { key: '4' }, secondary: { key: 'r' } },
  [APP_COMMAND_IDS.reviewScrollReadingDown]: { primary: { key: ' ' } },
  [APP_COMMAND_IDS.reviewScrollReadingUp]: { primary: { key: ' ', shiftKey: true } },
  [APP_COMMAND_IDS.deleteCurrentReviewItem]: { primary: { key: 't' }, secondary: { key: 'Delete' } },
  [APP_COMMAND_IDS.reviewNavigateParent]: { primary: { key: 'w' } },
  [APP_COMMAND_IDS.reviewNavigateBack]: { primary: { key: 'a' } },
  [APP_COMMAND_IDS.reviewNavigateForward]: { primary: { key: 'd' } },
  [APP_COMMAND_IDS.reviewNavigateDown]: { primary: { key: 's' } },
  [APP_COMMAND_IDS.reviewNavigatePreviousSibling]: { primary: { key: 'q' } },
  [APP_COMMAND_IDS.reviewNavigateNextSibling]: { primary: { key: 'e' } }
};

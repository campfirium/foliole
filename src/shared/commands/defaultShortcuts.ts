import { canUseBrowserReservedAppShortcuts } from '../platform/browserReservedShortcuts';

import { APP_COMMAND_IDS, type AppCommandId } from './ids';
import { MACOS_DEFAULT_APP_COMMAND_SHORTCUTS } from './macosDefaultShortcuts';
import type { CommandShortcut, CommandShortcutSet } from './types';

export type DefaultCommandShortcuts = Partial<Record<AppCommandId, CommandShortcutSet>>;

export const DEFAULT_APP_COMMAND_SHORTCUTS: DefaultCommandShortcuts = {
  [APP_COMMAND_IDS.toggleCommandPaletteMac]: { primary: { key: 'p', metaKey: true } },
  [APP_COMMAND_IDS.toggleCommandPaletteWin]: { primary: { key: 'p', ctrlKey: true } },
  [APP_COMMAND_IDS.openCommandPalette]: { primary: { key: 'p', ctrlKey: true }, secondary: { key: 'p', metaKey: true } },
  [APP_COMMAND_IDS.openWorkspaceSearch]: { primary: { key: 'k', ctrlKey: true }, secondary: { key: 'k', metaKey: true } },
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
  [APP_COMMAND_IDS.createTopic]: { primary: { key: 'n', ctrlKey: true } },
  [APP_COMMAND_IDS.createItem]: { primary: { key: 'n', ctrlKey: true, altKey: true } },
  [APP_COMMAND_IDS.importSingleFile]: { primary: { key: 'o', ctrlKey: true } },
  [APP_COMMAND_IDS.clipboardImport]: { primary: { key: 'v', ctrlKey: true, altKey: true } },
  [APP_COMMAND_IDS.globalCaptureToInbox]: { primary: { key: 'c', altKey: true, shiftKey: true } },
  [APP_COMMAND_IDS.findInTopic]: { primary: { key: 'f', ctrlKey: true }, secondary: { key: 'f', metaKey: true } },
  [APP_COMMAND_IDS.createSelectionHighlight]: { primary: { key: 'z', altKey: true } },
  [APP_COMMAND_IDS.createSelectionCloze]: { primary: { key: 'x', altKey: true } },
  [APP_COMMAND_IDS.addSelectionNote]: { primary: { key: 'a', altKey: true } },
  [APP_COMMAND_IDS.enterPriorityMode]: { primary: { key: 'm', ctrlKey: true }, secondary: { key: 'm', metaKey: true } },
  [APP_COMMAND_IDS.toggleEditorDisplayMode]: { primary: { key: '\\', ctrlKey: true }, secondary: { key: '\\', metaKey: true } },
  [APP_COMMAND_IDS.toggleImmersiveMode]: { primary: { key: 'F11' } },
  [APP_COMMAND_IDS.toggleDevTools]: { primary: { key: 'i', ctrlKey: true, shiftKey: true }, secondary: { key: 'i', metaKey: true, altKey: true } },
  [APP_COMMAND_IDS.toggleList]: {
    primary: { key: '[' },
    secondary: { key: 'l', ctrlKey: true, shiftKey: true },
    tertiary: { key: 'l', metaKey: true, shiftKey: true }
  },
  [APP_COMMAND_IDS.toggleRightSidebar]: { primary: { key: ']' } },
  [APP_COMMAND_IDS.toggleBothSidebars]: { primary: { key: '\\' } },
  [APP_COMMAND_IDS.startStudyMode]: { primary: { key: 'r', altKey: true }, secondary: { key: 'F1' } },
  [APP_COMMAND_IDS.revealReviewAnswer]: { primary: { key: 'f' } },
  [APP_COMMAND_IDS.gradeReviewAgain]: { primary: { key: '1' } },
  [APP_COMMAND_IDS.gradeReviewHard]: { primary: { key: '2' } },
  [APP_COMMAND_IDS.gradeReviewGood]: { primary: { key: 'f' }, secondary: { key: '3' } },
  [APP_COMMAND_IDS.gradeReviewEasy]: { primary: { key: '4' } },
  [APP_COMMAND_IDS.readingReviewSoon]: { primary: { key: '1' } },
  [APP_COMMAND_IDS.readingReviewLater]: { primary: { key: '2' } },
  [APP_COMMAND_IDS.readingReviewPostpone]: { primary: { key: 'j', ctrlKey: true }, secondary: { key: 'j', metaKey: true } },
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
  [APP_COMMAND_IDS.reviewNavigateNextSibling]: { primary: { key: 'e' } },
  [APP_COMMAND_IDS.deleteReviewSourceTopic]: { primary: { key: 't', altKey: true } }
};

const SHORTCUT_SET_SLOTS = ['primary', 'secondary', 'tertiary'] as const;

function resolvePlatformText() {
  if (typeof navigator === 'undefined') {
    return '';
  }
  return `${navigator.platform} ${navigator.userAgent}`.toLowerCase();
}

function isMacPlatform(platform = resolvePlatformText()) {
  return platform.toLowerCase().includes('mac');
}

interface PlatformDefaultCommandShortcutOptions {
  includeBrowserReservedShortcuts?: boolean;
  platform?: string;
}

function resolveDefaultShortcutOptions(
  platformOrOptions?: PlatformDefaultCommandShortcutOptions | string
): PlatformDefaultCommandShortcutOptions {
  if (typeof platformOrOptions === 'string') {
    return { platform: platformOrOptions };
  }
  return platformOrOptions ?? {};
}

function shouldKeepDefaultShortcut(commandId: AppCommandId, options: PlatformDefaultCommandShortcutOptions) {
  const includeBrowserReservedShortcuts =
    options.includeBrowserReservedShortcuts ?? canUseBrowserReservedAppShortcuts();
  return commandId !== APP_COMMAND_IDS.toggleImmersiveMode || includeBrowserReservedShortcuts;
}

function getShortcutSignature(shortcut: CommandShortcut) {
  return [
    `m:${shortcut.metaKey ? 1 : 0}`,
    `c:${shortcut.ctrlKey ? 1 : 0}`,
    `a:${shortcut.altKey ? 1 : 0}`,
    `s:${shortcut.shiftKey ? 1 : 0}`,
    `k:${shortcut.key}`
  ].join('|');
}

export function getPlatformDefaultCommandShortcuts(
  platformOrOptions?: PlatformDefaultCommandShortcutOptions | string
): DefaultCommandShortcuts {
  const options = resolveDefaultShortcutOptions(platformOrOptions);
  const resolved: DefaultCommandShortcuts = {};
  const platformDefaults = isMacPlatform(options.platform)
    ? MACOS_DEFAULT_APP_COMMAND_SHORTCUTS
    : DEFAULT_APP_COMMAND_SHORTCUTS;
  for (const [commandId, shortcuts] of Object.entries(platformDefaults)) {
    if (!shouldKeepDefaultShortcut(commandId as AppCommandId, options)) {
      continue;
    }
    const nextSet: CommandShortcutSet = {};
    const seen = new Set<string>();
    for (const slot of SHORTCUT_SET_SLOTS) {
      const shortcut = shortcuts?.[slot];
      if (!shortcut) {
        continue;
      }
      const signature = getShortcutSignature(shortcut);
      if (seen.has(signature)) {
        continue;
      }
      seen.add(signature);
      nextSet[slot] = shortcut;
    }
    resolved[commandId as AppCommandId] = nextSet;
  }
  return resolved;
}

import { useEffect } from 'react';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { resolveCommandShortcutDispatch } from '../../shared/commands/shortcutDispatcher';
import { matchesShortcutSet } from '../../shared/commands/shortcuts';
import type { CommandPaletteItem, CommandShortcutSet } from '../../shared/commands/types';
import { onWindowKeydownCapture } from '../../shared/platform/keyboard';

import { DOCUMENT_SHORTCUT_COMMAND_IDS, REVIEW_SHORTCUT_COMMAND_IDS } from './reviewHotkeysState';

const DEDICATED_SHORTCUT_COMMAND_IDS = new Set<string>([
  ...DOCUMENT_SHORTCUT_COMMAND_IDS,
  ...REVIEW_SHORTCUT_COMMAND_IDS,
  APP_COMMAND_IDS.closeSettings,
  APP_COMMAND_IDS.openCommandPalette,
  APP_COMMAND_IDS.openWorkspaceSearch,
  APP_COMMAND_IDS.toggleImmersiveMode
]);

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);
const FUNCTION_KEY_PATTERN = /^F(?:[1-9]|1[0-9]|2[0-4])$/;

function isEditableElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) {
    return true;
  }
  if (target instanceof HTMLTextAreaElement) {
    return !target.readOnly && !target.disabled;
  }
  if (target instanceof HTMLInputElement) {
    return !target.readOnly && !target.disabled && !NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase());
  }
  return false;
}

function shouldSkipCommandShortcut(args: {
  event: KeyboardEvent;
  isCommandSurfaceOpen: boolean;
  shortcutMap: Record<string, CommandShortcutSet | undefined>;
}) {
  if (args.isCommandSurfaceOpen) {
    return true;
  }
  const isEditing = isEditableElement(args.event.target) || isEditableElement(document.activeElement);
  if (!isEditing) {
    return false;
  }
  const isContentHistoryShortcut =
    args.event.target instanceof Element &&
    Boolean(args.event.target.closest('[data-undo-history-owner="content"]')) &&
    (
      matchesShortcutSet(args.event, args.shortcutMap[APP_COMMAND_IDS.undo]) ||
      matchesShortcutSet(args.event, args.shortcutMap[APP_COMMAND_IDS.redo])
    );
  if (isContentHistoryShortcut) {
    return false;
  }
  return !args.event.altKey && !args.event.ctrlKey && !args.event.metaKey && !FUNCTION_KEY_PATTERN.test(args.event.key);
}

export function useAppCommandShortcutDispatcher(args: {
  isCommandSurfaceOpen: boolean;
  items: CommandPaletteItem[];
  runCommand: (id: string) => void;
  shortcutMap: Record<string, CommandShortcutSet | undefined>;
}) {
  useEffect(
    () =>
      onWindowKeydownCapture((event) => {
        if (shouldSkipCommandShortcut({
          event,
          isCommandSurfaceOpen: args.isCommandSurfaceOpen,
          shortcutMap: args.shortcutMap
        })) {
          return;
        }
        const commandId = resolveCommandShortcutDispatch({
          event,
          ignoredCommandIds: DEDICATED_SHORTCUT_COMMAND_IDS,
          items: args.items,
          shortcutMap: args.shortcutMap
        });
        if (!commandId) {
          return;
        }
        event.preventDefault();
        args.runCommand(commandId);
      }),
    [args]
  );
}

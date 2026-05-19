import { useEffect } from 'react';

import { APP_COMMAND_IDS } from '../../shared/commands/ids';
import { resolveCommandShortcutDispatch } from '../../shared/commands/shortcutDispatcher';
import type { CommandPaletteItem, CommandShortcutSet } from '../../shared/commands/types';
import { onWindowKeydown } from '../../shared/platform/keyboard';

import { DOCUMENT_SHORTCUT_COMMAND_IDS, REVIEW_SHORTCUT_COMMAND_IDS } from './reviewHotkeysState';

const DEDICATED_SHORTCUT_COMMAND_IDS = new Set<string>([
  ...DOCUMENT_SHORTCUT_COMMAND_IDS,
  ...REVIEW_SHORTCUT_COMMAND_IDS,
  APP_COMMAND_IDS.closeSettings,
  APP_COMMAND_IDS.toggleDevTools,
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
}) {
  if (args.isCommandSurfaceOpen) {
    return true;
  }
  const isEditing = isEditableElement(args.event.target) || isEditableElement(document.activeElement);
  if (!isEditing) {
    return false;
  }
  const isAppUndoRedoShortcut =
    args.event.key.toLowerCase() === 'z' &&
    !args.event.altKey &&
    (args.event.ctrlKey || args.event.metaKey);
  if (isAppUndoRedoShortcut) {
    return true;
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
      onWindowKeydown((event) => {
        if (shouldSkipCommandShortcut({ event, isCommandSurfaceOpen: args.isCommandSurfaceOpen })) {
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

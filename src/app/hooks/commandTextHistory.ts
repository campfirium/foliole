import { APP_COMMAND_IDS } from '../../shared/commands/ids';

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

export function isEditableElement(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('[contenteditable="true"]')) return true;
  if (target instanceof HTMLTextAreaElement) return !target.readOnly && !target.disabled;
  if (target instanceof HTMLInputElement) {
    return !target.readOnly && !target.disabled && !NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase());
  }
  return false;
}

export function ownsTextHistory(target: EventTarget | null) {
  if (!isEditableElement(target)) return false;
  return !target.closest('[data-undo-history-owner="content"]');
}

export function runFocusedTextHistory(commandId: string) {
  if (commandId !== APP_COMMAND_IDS.undo && commandId !== APP_COMMAND_IDS.redo) return false;
  if (!ownsTextHistory(document.activeElement)) return false;
  // Keep the browser's text undo buffer, including its empty-history no-op.
  document.execCommand(commandId === APP_COMMAND_IDS.undo ? 'undo' : 'redo');
  return true;
}

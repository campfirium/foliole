const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);

export function isImmersiveEditableElement(target: EventTarget | null) {
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

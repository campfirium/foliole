const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit']);
const SPACE_INTERACTIVE_ROLES = new Set(['button', 'checkbox', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'radio', 'switch', 'tab', 'treeitem']);

export function isEditableKeyboardTarget(target: EventTarget | null) {
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

export function isSpaceReservedKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (isEditableKeyboardTarget(target)) {
    return true;
  }
  if (target instanceof HTMLButtonElement || target instanceof HTMLSelectElement) {
    return !target.disabled;
  }
  if (target instanceof HTMLInputElement) {
    return !target.disabled && NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase());
  }
  const interactiveTarget = target.closest<HTMLElement>(
    'button,input,select,textarea,[contenteditable],[role]'
  );
  if (!interactiveTarget || interactiveTarget.getAttribute('aria-disabled') === 'true') {
    return false;
  }
  const role = interactiveTarget.getAttribute('role');
  return Boolean(role && SPACE_INTERACTIVE_ROLES.has(role));
}

export function blurActiveKeyboardTarget() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

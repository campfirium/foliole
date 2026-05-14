const FOCUSABLE_SELECTOR = [
  'button',
  'input',
  'select',
  'textarea',
  'a[href]',
  '[tabindex]',
  '[contenteditable]',
  '[role="button"]',
  '[role="treeitem"]',
  '[role="menuitem"]',
  '[role="option"]'
].join(',');

function hasDisabledState(element: HTMLElement) {
  return element.hasAttribute('disabled') || element.getAttribute('aria-disabled') === 'true';
}

function hasHiddenAncestor(element: HTMLElement) {
  return Boolean(element.closest('[hidden],[aria-hidden="true"],[inert]'));
}

function isRendered(element: HTMLElement) {
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (current.style.display === 'none' || current.style.visibility === 'hidden') {
      return false;
    }
    const style = window.getComputedStyle(current);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return false;
    }
  }
  return true;
}

function isEditable(element: HTMLElement) {
  const contentEditable = element.getAttribute('contenteditable');
  return contentEditable === '' || contentEditable === 'true' || contentEditable === 'plaintext-only';
}

export function isFocusableElement(element: HTMLElement) {
  if (hasDisabledState(element) || hasHiddenAncestor(element) || !isRendered(element)) {
    return false;
  }
  return isEditable(element) || element.tabIndex >= 0;
}

export function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isFocusableElement);
}

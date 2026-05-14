import { useEffect, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

const FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

let lastFocusedElement: HTMLElement | null = null;
let focusTrackingUsers = 0;

function rememberActiveElement() {
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    lastFocusedElement = document.activeElement;
  }
}

function rememberFocusedElement(event: FocusEvent) {
  lastFocusedElement = event.target instanceof HTMLElement ? event.target : null;
}

function retainFocusTracking() {
  if (typeof document === 'undefined') {
    return;
  }
  focusTrackingUsers += 1;
  if (focusTrackingUsers > 1) {
    return;
  }
  document.addEventListener('focusin', rememberFocusedElement);
  document.addEventListener('keydown', rememberActiveElement, true);
  document.addEventListener('pointerdown', rememberActiveElement, true);
}

function releaseFocusTracking() {
  if (typeof document === 'undefined' || focusTrackingUsers === 0) {
    return;
  }
  focusTrackingUsers -= 1;
  if (focusTrackingUsers > 0) {
    return;
  }
  document.removeEventListener('focusin', rememberFocusedElement);
  document.removeEventListener('keydown', rememberActiveElement, true);
  document.removeEventListener('pointerdown', rememberActiveElement, true);
  lastFocusedElement = null;
}

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) => !element.hasAttribute('hidden'));
}

function getCurrentRestoreTarget() {
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    return document.activeElement;
  }
  return lastFocusedElement;
}

function restoreFocus(element: HTMLElement | null) {
  if (!element || !document.contains(element)) {
    return;
  }
  element.focus({ preventScroll: true });
}

function scheduleRestoreFocus(element: HTMLElement | null) {
  window.setTimeout(() => restoreFocus(element), 0);
}

export function useFloatingDialogFocusTrap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    retainFocusTracking();
    previousFocusRef.current = getCurrentRestoreTarget();
    return releaseFocusTracking;
  }, []);

  useEffect(() => () => scheduleRestoreFocus(previousFocusRef.current), []);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const focusableElements = getFocusableElements(container);
    if (!focusableElements.length) {
      event.preventDefault();
      return;
    }
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement?.focus();
      return;
    }
    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement?.focus();
    }
  };

  return { containerRef, handleKeyDown };
}

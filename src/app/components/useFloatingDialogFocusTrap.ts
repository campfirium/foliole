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
let isFocusTrackingEnabled = false;

function enableFocusTracking() {
  if (isFocusTrackingEnabled || typeof document === 'undefined') {
    return;
  }
  const rememberActiveElement = () => {
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
      lastFocusedElement = document.activeElement;
    }
  };
  document.addEventListener('focusin', (event) => {
    lastFocusedElement = event.target instanceof HTMLElement ? event.target : null;
  });
  document.addEventListener('keydown', rememberActiveElement, true);
  document.addEventListener('pointerdown', rememberActiveElement, true);
  isFocusTrackingEnabled = true;
}

enableFocusTracking();

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
    enableFocusTracking();
    previousFocusRef.current = getCurrentRestoreTarget();
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

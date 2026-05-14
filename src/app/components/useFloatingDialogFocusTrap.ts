import { useEffect, useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';

import { getFocusableElements } from '../../shared/lib/focusableDom';

function getCurrentRestoreTarget() {
  if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body) {
    return document.activeElement;
  }
  return null;
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

export function useFloatingDialogFocusTrap(isActive = true) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!isActive) {
      return undefined;
    }
    previousFocusRef.current = getCurrentRestoreTarget();
    return undefined;
  }, [isActive]);

  useEffect(
    () => () => {
      if (isActive) {
        scheduleRestoreFocus(previousFocusRef.current);
        previousFocusRef.current = null;
      }
    },
    [isActive]
  );

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

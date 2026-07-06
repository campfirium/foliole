export const SELECTION_SETTLE_DELAY_MS = 240;

const ACTIVE_HIGHLIGHT_CLASS = 'cm-md-highlight-active';
const ACTIVE_HIGHLIGHT_TARGET_SELECTOR = '.cm-md-highlight, .cm-md-highlight-overlap, .cm-md-cloze, .cm-md-anchor-overlap';
const RECENT_SELECTION_INTERACTION_MS = 2_000;

export function isCompanionSelectionToolbarTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest('[data-companion-selection-toolbar]') !== null;
}

export function isCompanionSelectionToolbarActiveElement() {
  return isCompanionSelectionToolbarTarget(document.activeElement);
}

export function hasRecentSelectionInteraction(lastInteractionAt: number) {
  return lastInteractionAt > 0 && Date.now() - lastInteractionAt < RECENT_SELECTION_INTERACTION_MS;
}

export function clearCompanionActiveHighlightElements() {
  document.querySelectorAll('.' + ACTIVE_HIGHLIGHT_CLASS).forEach((element) => {
    element.classList.remove(ACTIVE_HIGHLIGHT_CLASS);
  });
}

export function activateCompanionHighlightTarget(target: EventTarget | null) {
  clearCompanionActiveHighlightElements();
  if (!(target instanceof Element)) return;
  const highlightElement = target.closest(ACTIVE_HIGHLIGHT_TARGET_SELECTOR);
  highlightElement?.classList.add(ACTIVE_HIGHLIGHT_CLASS);
}

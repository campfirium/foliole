import type { MouseEvent, PointerEvent } from 'react';

import { loadCompanionReadingMode } from './companionReadingMode';
import { isCompanionArticleInteractiveTarget } from './companionSelectionToolbarDom';

export function isPagedReadingInteraction(target: EventTarget | null) {
  return isCompanionArticleInteractiveTarget(target) || (target instanceof Element && Boolean(target.closest(
    '[role="dialog"], .cm-md-highlight, .cm-md-highlight-overlap, .cm-md-cloze, .cm-md-anchor-overlap'
  )));
}

export function turnCompanionReadingPage(surface: HTMLElement, direction: number) {
  const style = getComputedStyle(surface);
  const body = surface.querySelector('[data-reading-font-size]') ?? surface;
  const bodyStyle = getComputedStyle(body);
  const readingLineHeight = parseFloat(bodyStyle.getPropertyValue('--content-panel-font-size')) *
    parseFloat(bodyStyle.getPropertyValue('--content-panel-line-height'));
  const lineHeight = readingLineHeight || parseFloat(bodyStyle.lineHeight) || parseFloat(bodyStyle.fontSize) * 1.62 || 28;
  const viewport = surface.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
  // Keep one line of overlap so that a line crossing the viewport edge is never lost.
  const step = Math.max(lineHeight, Math.floor(viewport / lineHeight - 1) * lineHeight);
  const limit = Math.max(0, surface.scrollHeight - surface.clientHeight);
  surface.scrollTop = Math.min(limit, Math.max(0, surface.scrollTop + direction * step));
}

export function handleCompanionPagedTap(event: MouseEvent<HTMLElement> | PointerEvent<HTMLElement>) {
  if (loadCompanionReadingMode() !== 'paged' || event.detail === 0 && event.type === 'click') return false;
  const bounds = event.currentTarget.getBoundingClientRect();
  if (!bounds.width) return false;
  const x = (event.clientX - bounds.left) / bounds.width;
  if (x >= 0.2 && x <= 0.8) return false;
  turnCompanionReadingPage(event.currentTarget, x < 0.2 ? -1 : 1);
  return true;
}

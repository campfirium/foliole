import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';

export interface MarkdownImageStatusActions {
  canRetryFromSource?: boolean;
  onContextMenu?: ((event: MouseEvent, anchor: HTMLElement) => void) | null;
  onProvideSourceWebsite?: (() => void) | null;
  onRemoveImage?: (() => void) | null;
  onRetry?: (() => void) | null;
  sourceUrl?: string | null;
  unavailableCopy?: 'default' | 'demo';
}

export function createImageStatusElement(
  status: 'loading' | 'unavailable',
  display: MarkdownImageMatch['display'],
  actions: MarkdownImageStatusActions = {}
) {
  const element = document.createElement('span');
  element.className = display === 'inline' ? 'cm-md-image-status cm-md-image-status-inline' : 'cm-md-image-status cm-md-image-status-block';
  element.dataset.mdImageStatus = status;
  if (status === 'loading') {
    element.textContent = '';
    return element;
  }

  if (display === 'inline') {
    element.textContent = t(resolveInlineUnavailableKey(actions.unavailableCopy));
    return element;
  }
  if (actions.onContextMenu) {
    element.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      event.stopPropagation();
      actions.onContextMenu?.(event, element);
    });
  }

  element.append(createFrame(formatSourceLabel(actions.sourceUrl), actions));
  return element;
}

function createFrame(sourceLabel: string | null, actions: MarkdownImageStatusActions) {
  const frame = document.createElement('span');
  frame.className = 'cm-md-image-status-frame';
  const glyph = document.createElement('span');
  glyph.className = 'cm-md-image-status-frame-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = LEAF_ICON_SVG;
  const copy = document.createElement('span');
  copy.className = 'cm-md-image-status-frame-copy';
  const caption = document.createElement('span');
  caption.className = 'cm-md-image-status-frame-caption';
  caption.textContent = t(resolveCaptionUnavailableKey(actions.unavailableCopy));
  copy.append(caption);
  if (sourceLabel) {
    const source = document.createElement('span');
    source.className = 'cm-md-image-status-frame-source';
    source.textContent = sourceLabel;
    source.title = sourceLabel;
    copy.append(source);
  }
  frame.append(glyph, copy);
  const toolbar = createToolbar(actions);
  if (toolbar) frame.append(toolbar);
  return frame;
}

function resolveInlineUnavailableKey(copy: MarkdownImageStatusActions['unavailableCopy'] = 'default') {
  return copy === 'demo'
    ? 'desktop.imageStatus.demoUnavailable.inline'
    : 'desktop.imageStatus.unavailable.inline';
}

function resolveCaptionUnavailableKey(copy: MarkdownImageStatusActions['unavailableCopy'] = 'default') {
  return copy === 'demo'
    ? 'desktop.imageStatus.demoUnavailable.caption'
    : 'desktop.imageStatus.unavailable.caption';
}

function createToolbar(actions: MarkdownImageStatusActions) {
  const hasActions = (actions.canRetryFromSource && actions.onRetry) || actions.onProvideSourceWebsite || actions.onRemoveImage;
  if (!hasActions) return null;
  const toolbar = document.createElement('span');
  toolbar.className = 'cm-md-image-status-toolbar';
  if (actions.canRetryFromSource && actions.onRetry) {
    toolbar.append(createToolbarIconButton(t('desktop.imageStatus.retry'), 'retry', actions.onRetry));
  }
  if (actions.onProvideSourceWebsite) {
    toolbar.append(createToolbarIconButton(t('desktop.imageStatus.addSource'), 'source', actions.onProvideSourceWebsite));
  }
  if (actions.onRemoveImage) {
    toolbar.append(createToolbarIconButton(t('desktop.imageStatus.remove'), 'remove', actions.onRemoveImage));
  }
  return toolbar;
}

function createToolbarIconButton(label: string, icon: 'remove' | 'retry' | 'source', onClick: () => void) {
  const action = document.createElement('button');
  action.ariaLabel = label;
  action.className = 'cm-md-image-status-toolbar-button';
  action.title = icon === 'source'
    ? t('desktop.imageStatus.addSourceHelp')
    : label;
  action.type = 'button';
  action.innerHTML = createIconSvg(icon);
  action.addEventListener('click', onClick);
  return action;
}

function t(key: Parameters<typeof translate>[1], params?: Parameters<typeof translate>[2]) {
  return translate(getStoredAppLocale(), key, params);
}

function createIconSvg(icon: 'remove' | 'retry' | 'source') {
  const path = {
    remove: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v5"/><path d="M14 11v5"/>',
    retry: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
    source: '<path d="M10 13a5 5 0 0 0 7.07 0l2.12-2.12a5 5 0 0 0-7.07-7.07L11 4.93"/><path d="M14 11a5 5 0 0 0-7.07 0L4.81 13.12a5 5 0 0 0 7.07 7.07L13 19.07"/>'
  }[icon];
  return `<svg aria-hidden="true" class="cm-md-image-status-toolbar-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2">${path}</svg>`;
}

const LEAF_ICON_SVG = '<svg viewBox="0 0 64 48" aria-hidden="true"><path fill="currentColor" d="M31.8 39.5c-9.6-2.4-15.2-8.8-15.2-16.6 0-10.3 11.4-17.1 30.4-18.4-1 18.7-8.4 29.9-18.9 29.9-2.6 0-5.1-.6-7.3-1.8 3.8-6.1 9.7-10.7 17.7-13.9-9.6 1.9-17.2 6.4-22.7 13.5-3.3 2.1-5.9 4.9-7.8 8.3 7.3-4.5 15.2-4.8 23.8-1Z"/></svg>';

function formatSourceLabel(sourceUrl: string | null | undefined) {
  if (!sourceUrl) return null;
  try {
    const url = new URL(sourceUrl);
    return `${url.hostname}${url.pathname}${url.search}`;
  } catch {
    return sourceUrl;
  }
}

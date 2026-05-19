import type { Range } from '@codemirror/state';
import { Decoration, WidgetType } from '@codemirror/view';

import { dispatchReadwiseOriginalFileWidgetAction } from '../../../shared/platform/readwiseOriginalFileWidgetEvents';
import type { ReadwiseOriginalFilePlaceholderRange } from '../model/readwiseOriginalFilePlaceholder';

class ReadwiseOriginalFileWidget extends WidgetType {
  readonly nodeId: string | null;
  readonly placeholder: ReadwiseOriginalFilePlaceholderRange;

  constructor(placeholder: ReadwiseOriginalFilePlaceholderRange, nodeId: string | null) {
    super();
    this.placeholder = placeholder;
    this.nodeId = nodeId;
  }

  override eq(other: ReadwiseOriginalFileWidget) {
    return (
      this.nodeId === other.nodeId &&
      this.placeholder.from === other.placeholder.from &&
      this.placeholder.to === other.placeholder.to &&
      this.placeholder.kind === other.placeholder.kind &&
      this.placeholder.sourceLabel === other.placeholder.sourceLabel
    );
  }

  override toDOM() {
    return createReadwiseOriginalFileElement(this.placeholder, this.nodeId);
  }
}

export function addReadwiseOriginalFileDecorations(
  ranges: Range<Decoration>[],
  placeholders: readonly ReadwiseOriginalFilePlaceholderRange[],
  nodeId: string | null
) {
  for (const placeholder of placeholders) {
    ranges.push(
      Decoration.replace({
        inclusive: false,
        widget: new ReadwiseOriginalFileWidget(placeholder, nodeId)
      }).range(placeholder.from, placeholder.to)
    );
    for (const hiddenRange of placeholder.hiddenRanges) {
      ranges.push(Decoration.replace({ inclusive: false }).range(hiddenRange.from, hiddenRange.to));
    }
  }
}

function createReadwiseOriginalFileElement(placeholder: ReadwiseOriginalFilePlaceholderRange, nodeId: string | null) {
  const element = document.createElement('span');
  element.className = 'cm-md-image-status cm-md-image-status-block cm-md-readwise-original-file';
  element.dataset.readwiseOriginalFile = 'missing';
  element.append(createFrame(placeholder, nodeId));
  return element;
}

function createFrame(placeholder: ReadwiseOriginalFilePlaceholderRange, nodeId: string | null) {
  const frame = document.createElement('span');
  frame.className = 'cm-md-image-status-frame';
  const glyph = document.createElement('span');
  glyph.className = 'cm-md-image-status-frame-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = BOOK_ICON_SVG;
  const copy = document.createElement('span');
  copy.className = 'cm-md-image-status-frame-copy';
  const caption = document.createElement('span');
  caption.className = 'cm-md-image-status-frame-caption';
  caption.textContent = `Original file not imported · ${placeholder.kind}`;
  const source = document.createElement('span');
  source.className = 'cm-md-image-status-frame-source';
  source.textContent = placeholder.sourceLabel;
  source.title = placeholder.sourceLabel;
  const detail = document.createElement('span');
  detail.className = 'cm-md-readwise-original-file-detail';
  detail.hidden = true;
  detail.textContent = 'Download opens Readwise in your default browser. After saving the file, use Load here.';
  copy.append(caption, source, detail);
  frame.append(glyph, copy, createToolbar(nodeId, detail));
  return frame;
}

function createToolbar(nodeId: string | null, detail: HTMLElement) {
  const toolbar = document.createElement('span');
  toolbar.className = 'cm-md-image-status-toolbar cm-md-readwise-original-file-toolbar';
  toolbar.append(
    createHelpButton(detail),
    createActionButton('Download original file', DOWNLOAD_ICON_SVG, 'download', nodeId),
    createActionButton('Load original file', LOAD_ICON_SVG, 'load', nodeId)
  );
  return toolbar;
}

function createActionButton(label: string, iconSvg: string, action: 'download' | 'load', nodeId: string | null) {
  const button = document.createElement('button');
  button.className = 'cm-md-image-status-toolbar-button cm-md-readwise-original-file-action';
  button.type = 'button';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.innerHTML = iconSvg;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (nodeId) dispatchReadwiseOriginalFileWidgetAction({ action, nodeId });
  });
  return button;
}

function createHelpButton(detail: HTMLElement) {
  const button = document.createElement('button');
  button.className = 'cm-md-image-status-toolbar-button cm-md-readwise-original-file-action';
  button.type = 'button';
  button.title = 'Original file help';
  button.setAttribute('aria-label', 'Original file help');
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = HELP_ICON_SVG;
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const shouldShow = detail.hidden;
    detail.hidden = !shouldShow;
    button.setAttribute('aria-expanded', shouldShow ? 'true' : 'false');
  });
  return button;
}

const BOOK_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/><path d="M6 8h2"/><path d="M6 12h2"/><path d="M16 8h2"/><path d="M16 12h2"/></svg>';
const DOWNLOAD_ICON_SVG = '<svg class="cm-md-image-status-toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/></svg>';
const LOAD_ICON_SVG = '<svg class="cm-md-image-status-toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7.2a2 2 0 0 1-1.6-.8L9.4 5.1A2 2 0 0 0 7.8 4H5a2 2 0 0 0-2 2v1.5"/><path d="M12 11v6"/><path d="M9 14h6"/></svg>';
const HELP_ICON_SVG = '<svg class="cm-md-image-status-toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 2.25-3 4"/><path d="M12 17h.01"/></svg>';

import type { EditorView } from '@codemirror/view';

import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';
import { createMarkdownImageDisplayWidthEdit } from '../model/markdownImageSize';

const MIN_IMAGE_WIDTH = 96;

function readCurrentImageRange(wrapper: HTMLElement, fallback: MarkdownImageMatch) {
  const from = Number(wrapper.dataset.mdImageFrom);
  const to = Number(wrapper.dataset.mdImageTo);
  return Number.isInteger(from) && Number.isInteger(to) ? { from, to } : { from: fallback.from, to: fallback.to };
}

function commitImageWidth(view: EditorView, wrapper: HTMLElement, imageMatch: MarkdownImageMatch, width: number | null) {
  const markdown = view.state.doc.toString();
  const edit = createMarkdownImageDisplayWidthEdit({
    imageRange: readCurrentImageRange(wrapper, imageMatch),
    markdown,
    width
  });
  if (!edit || markdown.slice(edit.from, edit.to) === edit.insert) return;
  view.dispatch({ changes: edit });
  view.requestMeasure();
}

function createResizeHandle() {
  const handle = document.createElement('button');
  handle.className =
    'cm-md-image-resize-handle absolute bottom-0 right-0 z-surface size-9 cursor-nwse-resize appearance-none border-0 bg-transparent p-0 text-foreground/60 opacity-0 shadow-none transition-[color,opacity] group-hover:opacity-100 hover:text-foreground focus-visible:rounded-sm focus-visible:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';
  handle.type = 'button';
  handle.setAttribute('aria-label', translate(getStoredAppLocale(), 'desktop.editor.image.resize'));
  handle.innerHTML = '<span aria-hidden="true" class="pointer-events-none absolute bottom-1 right-1 size-4 rounded-br-[2px] border-b-2 border-r-2 border-current"></span>';
  return handle;
}

export function attachMarkdownImageResize(wrapper: HTMLElement, view: EditorView, imageMatch: MarkdownImageMatch) {
  if (imageMatch.display !== 'block') return;
  const surface = wrapper.querySelector<HTMLElement>('.cm-md-image-surface-block');
  if (!surface) return;
  const handle = createResizeHandle();
  let drag: { pointerId: number; startWidth: number; startX: number } | null = null;

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    drag = { pointerId: event.pointerId, startWidth: surface.getBoundingClientRect().width, startX: event.clientX };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    const maxWidth = Math.max(MIN_IMAGE_WIDTH, wrapper.getBoundingClientRect().width);
    const width = Math.round(Math.min(maxWidth, Math.max(MIN_IMAGE_WIDTH, drag.startWidth + event.clientX - drag.startX)));
    surface.style.width = `${width}px`;
  });
  handle.addEventListener('pointerup', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    drag = null;
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
    const width = Number.parseInt(surface.style.width, 10) || surface.getBoundingClientRect().width;
    commitImageWidth(view, wrapper, imageMatch, width);
  });
  handle.addEventListener('dblclick', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    commitImageWidth(view, wrapper, imageMatch, null);
  });
  surface.append(handle);
}

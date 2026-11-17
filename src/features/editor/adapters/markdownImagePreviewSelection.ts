import type { EditorState } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import { IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT, getImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';
import { collectImageMatches, type MarkdownImageMatch } from '../model/markdownImageMatches';

import { selectImageClozeOccurrencePresentation } from './imageClozeOccurrencePresentation';
import { enableMarkdownImageCrop } from './liveMarkdownImageCrop';
import { disposeMarkdownImageWidgetDom } from './liveMarkdownImageDisposal';
import { createMarkdownImageElement } from './liveMarkdownImageElement';
import { enableMarkdownImageFocus } from './liveMarkdownImageFocus';
import { createImageSurface } from './liveMarkdownImageSurface';
import { updateMarkdownImageWidgetDomRange } from './liveMarkdownImageWidgetDom';
import { listenToPreviewSource } from './markdownImagePreviewBindings';

interface PreviewEditorOptions {
  annotationHost: HTMLElement;
  annotationSignal: AbortSignal;
  editorNodeId: string | null;
  host: HTMLElement;
  image: HTMLImageElement;
  match: MarkdownImageMatch;
  src: string;
  view: EditorView;
}

function renderPreviewWidget(args: PreviewEditorOptions) {
  const { image, match, src, view } = args;
  const widget = document.createElement('div');
  widget.className = 'cm-md-image-widget cm-md-image-preview-widget';
  updateMarkdownImageWidgetDomRange(widget, match);
  const surface = createImageSurface({ ...match, display: 'block' }, src, args.editorNodeId, {
    annotationTarget: { host: args.annotationHost, signal: args.annotationSignal },
    existingImage: image
  });
  widget.append(surface);
  const sizeSurface = () => {
    if (!image.naturalWidth) return;
    surface.style.setProperty('--preview-image-width', `${image.naturalWidth}px`);
    surface.style.setProperty('--preview-image-ratio', String(image.naturalWidth / image.naturalHeight));
    if (match.crop && surface.dataset.mdImageCropVisible === 'true') {
      surface.style.setProperty('--preview-crop-ratio', String(image.naturalWidth * match.crop.width / (image.naturalHeight * match.crop.height)));
    }
  };
  if (!image.complete) image.addEventListener('load', sizeSurface, { once: true });
  sizeSurface();
  enableMarkdownImageFocus(widget, view, match);
  enableMarkdownImageCrop(widget, view, match);
  return widget;
}

function readPreviewMatch(state: EditorState, binding: MarkdownImageMatch, from: number, to: number) {
  const candidate = collectImageMatches(from, state.sliceDoc(from, to))
    .find(image => image.from === from && image.to === to && image.attachmentId === binding.attachmentId);
  if (!candidate && binding.focusEditable === false) {
    return { ...binding, from, to };
  }
  return candidate;
}

export function mountMarkdownImagePreviewEditor(args: Omit<PreviewEditorOptions, 'annotationSignal' | 'image'>) {
  const lifetime = new AbortController();
  let tracked = { from: args.match.from, to: args.match.to };
  let match = readPreviewMatch(args.view.state, args.match, tracked.from, tracked.to);
  const image = createMarkdownImageElement({ alt: args.match.alt, display: 'block', source: args.src });
  image.draggable = false;
  image.loading = 'eager';
  let widget: HTMLElement | undefined;
  let previous = '';
  let disposed = false;
  const refresh = () => {
    if (disposed) return;
    const presentation = match && selectImageClozeOccurrencePresentation(getImageClozeEditorPresentation(args.editorNodeId), match);
    const signature = JSON.stringify({ match, presentation });
    if (signature === previous) return;
    previous = signature;
    if (widget) disposeMarkdownImageWidgetDom(widget);
    widget = match ? renderPreviewWidget({ ...args, image, match, annotationSignal: lifetime.signal }) : undefined;
    args.host.replaceChildren(...(widget ? [widget] : []));
  };
  const unlisten = listenToPreviewSource(args.view, update => {
    if (!update.docChanged) return;
    tracked = {
      from: update.changes.mapPos(tracked.from, -1),
      to: update.changes.mapPos(tracked.to, 1)
    };
    match = readPreviewMatch(update.state, args.match, tracked.from, tracked.to);
    queueMicrotask(refresh);
  });
  const onPresentation = (event: Event) => {
    if ((event as CustomEvent<{ editorNodeId: string }>).detail.editorNodeId === args.editorNodeId) queueMicrotask(refresh);
  };
  window.addEventListener(IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT, onPresentation);
  refresh();
  return () => {
    disposed = true;
    lifetime.abort();
    unlisten();
    window.removeEventListener(IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT, onPresentation);
    if (widget) disposeMarkdownImageWidgetDom(widget);
    args.host.replaceChildren();
  };
}

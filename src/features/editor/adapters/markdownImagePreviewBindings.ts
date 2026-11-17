import { EditorView, type ViewUpdate } from '@codemirror/view';

import { isDesktopRuntime } from '../../../shared/platform/runtime';
import type { MarkdownImageMatch } from '../model/markdownImageMatches';

interface Binding {
  match: MarkdownImageMatch;
  mount: (match: MarkdownImageMatch, src: string, host: HTMLElement, annotationHost: HTMLElement) => () => void;
}

const bindings = new WeakMap<HTMLElement, Binding>();
const listeners = new WeakMap<EditorView, (update: ViewUpdate) => void>();

export const markdownImagePreviewUpdates = EditorView.updateListener.of(update => {
  listeners.get(update.view)?.(update);
});

export function listenToPreviewSource(view: EditorView, listener: (update: ViewUpdate) => void) {
  listeners.set(view, listener);
  return () => {
    if (listeners.get(view) === listener) listeners.delete(view);
  };
}

export function bindMarkdownImagePreviewEditor(
  widget: HTMLElement, match: MarkdownImageMatch, mount: Binding['mount']
) {
  if (isDesktopRuntime() && match.attachmentId) bindings.set(widget, { match, mount });
}

export function getMarkdownImagePreviewEditor(button: HTMLElement, src: string) {
  const widget = button.closest<HTMLElement>('.cm-md-image-widget');
  const binding = widget && bindings.get(widget);
  if (!binding || !widget?.isConnected) return {};
  const match = { ...binding.match, from: Number(widget.dataset.mdImageFrom), to: Number(widget.dataset.mdImageTo) };
  return {
    mountEditor: (host: HTMLElement, annotationHost: HTMLElement) =>
      binding.mount(match, src, host, annotationHost)
  };
}

import type { EditorView } from '@codemirror/view';

import { imageFocusMaskStyle, type ImageFocusRect } from '../model/markdownImageFocus';
import { createMarkdownImageFocusEdit } from '../model/markdownImageSize';
import type { MarkdownImageMatch } from '../model/markdownImageTypes';

export const IMAGE_FOCUS_EVENT = 'foliole:editor-image-focus';

export function createImageFocusMask(focus: ImageFocusRect) {
  const mask = document.createElement('div');
  mask.className = 'cm-md-image-focus-mask';
  mask.setAttribute('aria-hidden', 'true');
  Object.assign(mask.style, imageFocusMaskStyle(focus));
  return mask;
}

export function enableMarkdownImageFocus(widget: HTMLElement, view: EditorView, match: MarkdownImageMatch) {
  if (!match.attachmentId || view.state.readOnly || match.focusEditable === false) return;
  if (view.state.sliceDoc(match.from, match.from + 3) === '![[') return;
  widget.dataset.mdImageFocusEditable = 'true';
  widget.addEventListener(IMAGE_FOCUS_EVENT, event => {
    if (view.state.readOnly || !widget.isConnected) return;
    const focus = (event as CustomEvent<ImageFocusRect>).detail;
    const from = Number(widget.dataset.mdImageFrom);
    const to = Number(widget.dataset.mdImageTo);
    const markdown = view.state.doc.toString();
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to > markdown.length || from >= to) return;
    const edit = createMarkdownImageFocusEdit({ imageRange: { from, to }, markdown, focus });
    if (edit && markdown.slice(edit.from, edit.to) !== edit.insert) view.dispatch({ changes: edit });
  });
}

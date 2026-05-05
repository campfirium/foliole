import { EditorView } from '@codemirror/view';

import {
  resolveDocumentPositionAtViewportPoint,
  resolveDocumentPositionAtViewportY,
  resolvePreferredViewportX
} from './codeMirrorEditorAdapterView';

export function resolvePrimaryVisiblePosition(view: EditorView) {
  const viewportRect = view.scrollDOM.getBoundingClientRect();
  const anchorY = viewportRect.top + viewportRect.height * 0.15;
  const line = Array.from(view.contentDOM.querySelectorAll('.cm-line'))
    .map((element) => element as HTMLElement)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        distance: Math.abs((rect.top + rect.bottom) / 2 - anchorY),
        element,
        rect,
        text: element.textContent?.trim() ?? ''
      };
    })
    .filter(({ rect, text }) => text.length > 0 && rect.bottom > viewportRect.top + 2 && rect.top < viewportRect.bottom)
    .sort((left, right) => left.distance - right.distance)[0];
  if (!line) {
    return resolveDocumentPositionAtViewportY(view, anchorY);
  }
  return resolveDocumentPositionAtViewportPoint(
    view,
    resolvePreferredViewportX(line.rect),
    (line.rect.top + line.rect.bottom) / 2
  );
}

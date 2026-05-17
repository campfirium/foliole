import type { EditorView } from '@codemirror/view';

export function resolvePositionClientRect(view: EditorView, position: number) {
  const rect = view.coordsAtPos(position);
  return rect ? new DOMRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top) : null;
}

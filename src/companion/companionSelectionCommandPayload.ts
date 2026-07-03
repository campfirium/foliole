import type { EditorAdapter, EditorSelection } from '@/features/editor/adapters/EditorAdapter';
import {
  getSelectionCommandPayload,
  getSelectionCommandPayloadForContentRanges,
  type SelectionCommandPayload
} from '@/shared/selectionCommandPayload';

function toElement(node: Node | null) {
  return node instanceof Element ? node : node?.parentElement ?? null;
}

function isSelectionInsideEditor(selection: Selection) {
  const anchor = toElement(selection.anchorNode);
  const focus = toElement(selection.focusNode);
  return Boolean(anchor?.closest('.cm-content') && focus?.closest('.cm-content'));
}

function getRectPositionRange(adapter: EditorAdapter, rects: DOMRectList): EditorSelection | null {
  const firstRect = rects[0];
  const lastRect = rects[rects.length - 1];
  if (!firstRect || !lastRect || !adapter.getDocumentPositionAtClientPoint) return null;
  const from = adapter.getDocumentPositionAtClientPoint(firstRect.left, firstRect.top + firstRect.height / 2);
  const to = adapter.getDocumentPositionAtClientPoint(
    Math.max(lastRect.left, lastRect.right - 1),
    lastRect.top + lastRect.height / 2
  );
  return from === null || to === null ? null : { from, to: Math.max(from + 1, to) };
}

function getDomSelectionRanges(adapter: EditorAdapter): EditorSelection[] {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim() || !isSelectionInsideEditor(selection)) {
    return [];
  }
  return Array.from({ length: selection.rangeCount }, (_, index) => {
    const rects = selection.getRangeAt(index).getClientRects();
    return rects.length > 0 ? getRectPositionRange(adapter, rects) : null;
  }).filter((range): range is EditorSelection => range !== null);
}

function getDomSelectionCommandPayload(parentNodeId: string, adapter: EditorAdapter | null) {
  if (!adapter) return null;
  const ranges = getDomSelectionRanges(adapter);
  return ranges.length > 0
    ? getSelectionCommandPayloadForContentRanges(parentNodeId, adapter.getContent(), ranges)
    : null;
}

export function resolveCompanionSelectionCommandPayload(
  parentNodeId: string,
  adapter: EditorAdapter | null
): SelectionCommandPayload | null {
  const adapterPayload = getSelectionCommandPayload(parentNodeId, adapter);
  const domPayload = getDomSelectionCommandPayload(parentNodeId, adapter);
  if (!adapterPayload) return domPayload;
  if (!domPayload) return adapterPayload;
  return domPayload.selectionText.length >= adapterPayload.selectionText.length ? domPayload : adapterPayload;
}

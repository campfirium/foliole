import { getDevanagariSelectionMode, type DevanagariSelectionMode } from '../shared/platform/supportLog/androidDevanagariSelectionMode';
import { traceAndroidSelection } from '../shared/platform/supportLog/androidSelectionTrace';


import type { EditorAdapter, EditorSelection } from '@/features/editor/adapters/EditorAdapter';
import { expandDevanagariAnnotationRange } from '@/features/editor/model/devanagariAnnotationRange';
import {
  getSelectionCommandPayload,
  getSelectionCommandPayloadForContentRanges,
  type SelectionCommandPayload
} from '@/shared/selectionCommandPayload';


function toElement(node: Node | null) {
  return node instanceof Element ? node : node?.parentElement ?? null;
}

function isSelectionInsideReadableArticle(selection: Selection) {
  const anchor = toElement(selection.anchorNode);
  const focus = toElement(selection.focusNode);
  const selector = '.cm-content, .markdown-editor-host, [data-companion-readable-document="true"]';
  return Boolean(anchor?.closest(selector) && focus?.closest(selector));
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

function getReadableDomSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.toString().trim() || !isSelectionInsideReadableArticle(selection)) {
    return null;
  }
  return selection;
}

function getDomSelectionRanges(adapter: EditorAdapter, selection: Selection): EditorSelection[] {
  const selectedText = selection.toString().trim();
  const rectRanges = Array.from({ length: selection.rangeCount }, (_, index) => {
    const rects = selection.getRangeAt(index).getClientRects();
    return rects.length > 0 ? getRectPositionRange(adapter, rects) : null;
  }).filter((range): range is EditorSelection => range !== null);
  if (rectRanges.length > 1 || (
    rectRanges.length === 1 && adapter.getContent().slice(rectRanges[0]!.from, rectRanges[0]!.to).trim() === selectedText
  )) return rectRanges;

  const textRange = getTextSelectionRange(adapter.getContent(), selectedText);
  return textRange ? [textRange] : [];
}

function getTextSelectionRange(content: string, selectionText: string): EditorSelection | null {
  const selectedText = selectionText.trim();
  if (!selectedText) return null;
  const from = content.indexOf(selectedText);
  if (from < 0 || content.indexOf(selectedText, from + selectedText.length) >= 0) return null;
  return { from, to: from + selectedText.length };
}

function getDomSelectionCommandPayload(parentNodeId: string, adapter: EditorAdapter, selection: Selection) {
  const ranges = getDomSelectionRanges(adapter, selection);
  return ranges.length > 0
    ? getSelectionCommandPayloadForContentRanges(parentNodeId, adapter.getContent(), ranges)
    : null;
}

const androidSelectionStarts = new WeakMap<EditorAdapter, {
  selection: Selection;
  content: string;
  position: number;
  range: EditorSelection;
}>();

function readAndroidDomRange(adapter: EditorAdapter, selection: Selection, content: string): EditorSelection | null {
  const { anchorNode, focusNode } = selection;
  if (!anchorNode?.isConnected || !focusNode?.isConnected || selection.rangeCount !== 1) return null;
  const fromFocus = adapter.getDocumentPositionAtDomPoint?.(focusNode, selection.focusOffset);
  if (fromFocus == null) return null;
  const fromAnchor = adapter.getDocumentPositionAtDomPoint?.(anchorNode, selection.anchorOffset);
  const editorRange = adapter.getSelection();
  const start = androidSelectionStarts.get(adapter);
  // WebView can replace the fixed endpoint with an ancestor while continuing to move the focus.
  const position = fromAnchor ?? (selection.anchorOffset === 0 &&
    anchorNode instanceof Element && anchorNode.contains(focusNode) &&
    start?.selection === selection && start.content === content &&
    start.range.from === editorRange.from && start.range.to === editorRange.to ? start.position : null);
  if (position == null || position === fromFocus) return null;
  if (fromAnchor != null) androidSelectionStarts.set(adapter, { selection, content, position, range: editorRange });
  return { from: Math.min(position, fromFocus), to: Math.max(position, fromFocus) };
}

function resolveAndroidSelectionPayload(parentNodeId: string, adapter: EditorAdapter, mode: DevanagariSelectionMode) {
  const selection = window.getSelection();
  const content = adapter.getContent();
  // A non-collapsed native range can contain only an invisible widget buffer.
  const range = selection && !selection.isCollapsed && /[^\s\p{Default_Ignorable_Code_Point}]/u.test(selection.toString())
    ? readAndroidDomRange(adapter, selection, content) : null;
  if (!range) {
    androidSelectionStarts.delete(adapter);
    traceAndroidSelection('payload', [0]);
    return null;
  }
  const normalized = mode === 'annotation' ? expandDevanagariAnnotationRange(content, range) : range;
  if (normalized.from !== range.from || normalized.to !== range.to) {
    traceAndroidSelection('normalize', [range.from, range.to, normalized.from, normalized.to]);
  }
  const payload = getSelectionCommandPayloadForContentRanges(parentNodeId, content, [normalized]);
  traceAndroidSelection('payload', [Number(Boolean(payload)), range.from, range.to]);
  return payload;
}

export function resolveCompanionSelectionCommandPayload(
  parentNodeId: string,
  adapter: EditorAdapter | null,
  fallbackPayload: SelectionCommandPayload | null = null,
  mode = getDevanagariSelectionMode()
): SelectionCommandPayload | null {
  if (!adapter) return fallbackPayload;
  if (mode && adapter.getDocumentPositionAtDomPoint) return resolveAndroidSelectionPayload(parentNodeId, adapter, mode);
  const domSelection = getReadableDomSelection();
  if (domSelection) return getDomSelectionCommandPayload(parentNodeId, adapter, domSelection);
  const adapterPayload = getSelectionCommandPayload(parentNodeId, adapter);
  return adapterPayload ?? fallbackPayload;
}

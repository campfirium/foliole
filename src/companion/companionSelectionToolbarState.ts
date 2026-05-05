import type { MouseEvent as ReactMouseEvent, MutableRefObject } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';

import {
  findCompanionExistingHighlightAtPosition,
  findCompanionExistingHighlightFromPayload,
  type CompanionExistingHighlightTarget
} from './companionExistingHighlightActions';
import type { CompanionSelectionAnnotationToolbarState } from './CompanionSelectionAnnotationToolbar';

import type { EditorAdapter } from '@/features/editor/adapters/EditorAdapter';
import type { SelectionCommandPayload } from '@/shared/selectionCommandPayload';

export type CompanionSelectionClientPoint = { clientX: number; clientY: number };

export function getDefaultSelectionClientPoint(): CompanionSelectionClientPoint {
  return {
    clientX: Math.max(8, window.innerWidth / 2),
    clientY: Math.max(8, window.innerHeight / 3)
  };
}

export function readSelectionClientPoint(
  event: MouseEvent | PointerEvent | TouchEvent | ReactMouseEvent<HTMLElement>
): CompanionSelectionClientPoint | null {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0] ?? event.touches[0];
    return touch ? { clientX: touch.clientX, clientY: touch.clientY } : null;
  }
  return { clientX: event.clientX, clientY: event.clientY };
}

function resolveToolbarPosition(fallback: CompanionSelectionClientPoint) {
  const selection = window.getSelection();
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
  const rect = range?.getBoundingClientRect();
  const anchor = rect && rect.width > 0 && rect.height > 0
    ? { left: rect.left + rect.width / 2, top: rect.top, bottom: rect.bottom }
    : { left: fallback.clientX, top: fallback.clientY, bottom: fallback.clientY };
  const toolbarWidth = 168;
  const notePanelWidth = 256;
  const top = anchor.top > 56 ? anchor.top - 48 : anchor.bottom + 10;
  return {
    left: Math.max(8, Math.min(anchor.left - toolbarWidth / 2, window.innerWidth - toolbarWidth - 8)),
    noteLeft: Math.max(8, Math.min(anchor.left - notePanelWidth / 2, window.innerWidth - notePanelWidth - 8)),
    noteTop: Math.max(8, anchor.bottom + 8),
    top: Math.max(8, top)
  };
}

export function resolveSelectionToolbarState(args: {
  fallback: CompanionSelectionClientPoint;
  payload: SelectionCommandPayload;
  snapshot: WorkspaceSnapshot | null;
}): CompanionSelectionAnnotationToolbarState {
  const existingHighlight = findCompanionExistingHighlightFromPayload(args.snapshot, args.payload);
  return {
    ...resolveToolbarPosition(args.fallback),
    existingHighlight: existingHighlight ?? undefined,
    payload: existingHighlight ? null : args.payload
  };
}

export function resolveExistingHighlightToolbarState(
  existingHighlight: CompanionExistingHighlightTarget,
  fallback: CompanionSelectionClientPoint
): CompanionSelectionAnnotationToolbarState {
  return { ...resolveToolbarPosition(fallback), existingHighlight, payload: null };
}

export function isExistingHighlightTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest('.cm-md-highlight, .cm-md-highlight-overlap') !== null;
}

export function resolveExistingHighlightAtCurrentCursor(args: {
  editorRef: MutableRefObject<EditorAdapter | null>;
  nodeId: string;
  snapshot: WorkspaceSnapshot | null;
}) {
  const selection = args.editorRef.current?.getSelection();
  if (!selection) return null;
  return findCompanionExistingHighlightAtPosition({
    parentNodeId: args.nodeId,
    position: Math.max(selection.from, selection.to),
    snapshot: args.snapshot
  });
}

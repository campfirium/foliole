import { useEffect, useRef, type RefObject } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { EditorAdapter, EditorSelection } from '../features/editor/adapters/EditorAdapter';
import { expandDevanagariAnnotationRange } from '../features/editor/model/devanagariAnnotationRange';
import { getDevanagariSelectionMode } from '../shared/platform/supportLog/androidDevanagariSelectionMode';
import { getSelectionCommandPayloadForContentRanges, type SelectionCommandPayload } from '../shared/selectionCommandPayload';

import type { CompanionSelectionAnnotationToolbarState } from './CompanionSelectionAnnotationToolbar';
import { getDefaultSelectionClientPoint, resolveSelectionToolbarState } from './companionSelectionToolbarState';


export function useCompanionAdjustableReadingRange(args: {
  nodeId: string;
  snapshot: WorkspaceSnapshot | null;
  editorRef: RefObject<EditorAdapter | null>;
  clearScheduledOpen: () => void;
  setToolbar: (state: CompanionSelectionAnnotationToolbarState) => void;
}) {
  const active = useRef<{ editor: EditorAdapter; content: string; payload: SelectionCommandPayload; range: EditorSelection } | null>(null);
  const clear = () => {
    const previous = active.current;
    active.current = null;
    previous?.editor.setReadingSelection?.(null);
  };
  useEffect(() => clear, [args.nodeId]);
  const resolve = () => {
    const current = active.current;
    return current && current.editor === args.editorRef.current && current.content === current.editor.getContent()
      ? current.payload : null;
  };
  function accept(payload: SelectionCommandPayload, nativeText?: string) {
    const editor = args.editorRef.current;
    const range = payload.entries[0]?.range;
    if (!editor || !range || payload.entries.length !== 1) return;
    args.clearScheduledOpen();
    const content = editor.getContent();
    const end = editor.getPositionClientRect?.(range.to);
    const fallback = end ? { clientX: end.right, clientY: end.bottom } : getDefaultSelectionClientPoint();
    const state = resolveSelectionToolbarState({ content, fallback, payload, snapshot: nativeText !== undefined ? args.snapshot : null });
    if (state.existingHighlight) { clear(); args.setToolbar(state); return; }
    active.current = { editor, content, payload, range };
    editor.setReadingSelection?.(range);
    args.setToolbar({ ...state, adjustableRange: range, selectedText: nativeText ?? content.slice(range.from, range.to) });
  }

  return {
    accept, clear, resolve,
    hasSelection: () => active.current !== null,
    setRange(range: EditorSelection) {
      const current = active.current;
      if (!current || !resolve()) return false;
      const next = getDevanagariSelectionMode() === 'annotation' ? expandDevanagariAnnotationRange(current.content, range) : range;
      const payload = getSelectionCommandPayloadForContentRanges(args.nodeId, current.content, [next]);
      if (!payload) return false;
      accept(payload);
      return true;
    },
    preview(range: EditorSelection | null) {
      const current = active.current;
      if (current && resolve()) current.editor.setReadingSelection?.(range ?? current.range);
    }
  };
}

import { useCallback, useRef, type RefObject } from 'react';

import type { WorkspaceSnapshot } from '../../lib/core/database/workspaceSnapshot';
import type { EditorAdapter, EditorSelection } from '../features/editor/adapters/EditorAdapter';
import { findContainingReadingParagraph } from '../features/editor/model/readingParagraphs';
import type { SelectionCommandPayload } from '../shared/selectionCommandPayload';

import type { CompanionSelectionAnnotationToolbarState } from './CompanionSelectionAnnotationToolbar';
import { resolveCompanionSelectionCommandPayload } from './companionSelectionCommandPayload';
import { getDefaultSelectionClientPoint, resolveSelectionToolbarState, type CompanionSelectionClientPoint } from './companionSelectionToolbarState';

function singleRange(payload: SelectionCommandPayload | null) {
  return payload?.entries.length === 1 ? payload.entries[0]?.range : undefined;
}

export function useCompanionSelectReadingParagraph(args: {
  editorRef: RefObject<EditorAdapter | null>;
  lastPayloadRef: RefObject<SelectionCommandPayload | null>;
  nodeId: string;
  setSelectionToolbar: (state: CompanionSelectionAnnotationToolbarState) => void;
  scheduler: {
    clearScheduledOpen: () => void;
    lastFallbackRef: RefObject<CompanionSelectionClientPoint | null>;
  };
  snapshot: WorkspaceSnapshot | null;
}) {
  const { editorRef, lastPayloadRef, nodeId } = args;
  const resolveSelectionPayload = useCallback(() => resolveCompanionSelectionCommandPayload(
    nodeId, editorRef.current, lastPayloadRef.current
  ), [editorRef, lastPayloadRef, nodeId]);
  const expanded = useRef<{ editor: EditorAdapter; content: string; range: EditorSelection; text: string } | null>(null);
  return {
    resolveSelectionPayload,
    selectReadingParagraph() {
      const editor = args.editorRef.current;
      if (!editor?.setNativeSelection) return;
      const current = singleRange(resolveSelectionPayload());
      if (!current) return;
      const content = editor.getContent();
      const paragraph = findContainingReadingParagraph(content, current);
      if (!paragraph) return;
      editor.setNativeSelection(paragraph);
      const payload = resolveSelectionPayload();
      const range = singleRange(payload);
      if (!payload || !range) return;
      // The source slice includes virtualized lines even when the native text omits them.
      expanded.current = { editor, content, range, text: content.slice(paragraph.from, paragraph.to) };
      args.scheduler.clearScheduledOpen();
      lastPayloadRef.current = payload;
      args.setSelectionToolbar(resolveSelectionToolbarState({
        content, payload, snapshot: args.snapshot,
        fallback: args.scheduler.lastFallbackRef.current ?? getDefaultSelectionClientPoint()
      }));
    },
    getExpandedParagraphText() {
      const paragraph = expanded.current;
      if (!paragraph || paragraph.editor !== args.editorRef.current ||
        paragraph.content !== paragraph.editor.getContent()) return undefined;
      const current = singleRange(resolveSelectionPayload());
      return current?.from === paragraph.range.from && current.to === paragraph.range.to ? paragraph.text : undefined;
    }
  };
}

import { useCallback, useRef } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';

import type { useCompanionTopicEditAutosave } from './useCompanionTopicEditAutosave';

/** Explicit save boundaries must include input still buffered by the editor. */
export function useCompanionEditorDraftFlush(
  state: ReturnType<typeof useCompanionTopicEditAutosave>,
  canEdit: boolean,
  onReady?: (editor: EditorAdapter | null) => void
) {
  const historySource = useRef(state.historySource);
  historySource.current = state.historySource;
  const editor = useRef<EditorAdapter | null>(null);
  const answerEditor = useRef<EditorAdapter | null>(null);
  const onAnswerEditorReady = useCallback((value: EditorAdapter | null) => {
    answerEditor.current = value;
    value?.bindTextHistorySource?.(nodeId => historySource.current?.(nodeId, 'reveal') ?? null);
  }, []);
  const onEditorReady = useCallback((value: EditorAdapter | null) => {
    editor.current = value;
    value?.bindTextHistorySource?.(nodeId => historySource.current?.(nodeId, 'content') ?? null);
    onReady?.(value);
  }, [onReady]);
  const flushPendingSave = useCallback(async () => {
    if (canEdit && editor.current) {
      editor.current.flushContentChanges?.();
      state.handleChange(editor.current.getContent());
    }
    if (canEdit && answerEditor.current) {
      answerEditor.current.flushContentChanges?.();
      state.handleRevealChange(answerEditor.current.getContent());
    }
    await state.flushPendingSave();
  }, [canEdit, state.handleChange, state.handleRevealChange, state.flushPendingSave]);
  return { editorState: { ...state, flushPendingSave }, onEditorReady, onAnswerEditorReady };
}

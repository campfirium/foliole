import { useCallback, useRef } from 'react';

import type { EditorAdapter } from '../features/editor/adapters/EditorAdapter';

import type { useCompanionTopicEditAutosave } from './useCompanionTopicEditAutosave';

/** Explicit save boundaries must include input still buffered by the editor. */
export function useCompanionEditorDraftFlush(
  state: ReturnType<typeof useCompanionTopicEditAutosave>,
  canEdit: boolean,
  onReady?: (editor: EditorAdapter | null) => void
) {
  const editor = useRef<EditorAdapter | null>(null);
  const onEditorReady = useCallback((value: EditorAdapter | null) => {
    editor.current = value;
    onReady?.(value);
  }, [onReady]);
  const flushPendingSave = useCallback(async () => {
    if (canEdit && editor.current) state.handleChange(editor.current.getContent());
    await state.flushPendingSave();
  }, [canEdit, state.handleChange, state.flushPendingSave]);
  return { editorState: { ...state, flushPendingSave }, onEditorReady };
}

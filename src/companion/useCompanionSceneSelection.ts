import { useEffect, useLayoutEffect, useRef } from 'react';

import type { useCompanionSelectionAnnotationToolbar } from './useCompanionSelectionAnnotationToolbar';

/** What a change of reading scene does to the selection and to editor focus. */
export function useCompanionSceneSelection(
  revealed: boolean,
  editing: boolean,
  toolbar: ReturnType<typeof useCompanionSelectionAnnotationToolbar>
) {
  const wasRevealed = useRef(revealed);
  // Showing the answer is a new scene: a selection or menu from the question does not carry over.
  useLayoutEffect(() => {
    const justRevealed = revealed && !wasRevealed.current;
    wasRevealed.current = revealed;
    if (justRevealed && (toolbar.selectionToolbar || toolbar.hasReadingSelection())) toolbar.clearSelectionAndCloseToolbar();
  }, [revealed, toolbar]);
  useEffect(() => {
    if (editing) toolbar.editorRef.current?.focus();
  }, [editing, toolbar.editorRef]);
}

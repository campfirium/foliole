import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';

import type { EditorContextMenuState } from './useEditorContextCommandHelpers';

const ACTIVE_HIGHLIGHT_CLASS = 'cm-md-highlight-active';
const EDITOR_TARGET_SELECTOR = '.cm-editor';

export function clearActiveHighlightElements() {
  document.querySelectorAll(`.${ACTIVE_HIGHLIGHT_CLASS}`).forEach((element) => {
    element.classList.remove(ACTIVE_HIGHLIGHT_CLASS);
  });
}

export function isEditorTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest(EDITOR_TARGET_SELECTOR) !== null;
}

export function createSelectionToolbarDeletionHandler(args: {
  editorRef: MutableRefObject<EditorAdapter | null>;
  setContextMenu: (value: EditorContextMenuState | null) => void;
}) {
  return (event: KeyboardEvent) => {
    const ranges = args.editorRef.current?.getSelectionRanges() ?? [];
    const isDeletion = event.key === 'Backspace' || event.key === 'Delete';
    if (!isDeletion || !isEditorTarget(event.target) || !ranges.some((range) => range.from < range.to)) return;
    clearActiveHighlightElements();
    args.setContextMenu(null);
  };
}

import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';

import { resolveCurrentParagraphSelection } from './immersiveReadingModel';
import type { WorkspaceLayoutProps } from './WorkspaceLayout';

export function focusImmersiveEditor(editorAdapterRef: WorkspaceLayoutProps['editorAdapterRef']) {
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      editorAdapterRef.current?.focus();
    });
  });
}

export function blurImmersiveActiveElement() {
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

export function clearParagraphMarker(editorAdapterRef: WorkspaceLayoutProps['editorAdapterRef']) {
  editorAdapterRef.current?.setParagraphMarker?.(null);
}

export function getReadingPositionSelection(props: WorkspaceLayoutProps, currentSelection: EditorSelection) {
  if (currentSelection.from !== 0 || currentSelection.to !== 0) {
    return currentSelection;
  }
  const viewportSelection = getViewportReadingSelection(props);
  if (viewportSelection) {
    return viewportSelection;
  }
  const persistedSelection = props.editorNodeViewState?.selection;
  if (!persistedSelection) {
    return currentSelection;
  }
  return persistedSelection;
}

function getViewportReadingSelection(props: WorkspaceLayoutProps) {
  const editor = props.editorAdapterRef.current;
  const scroller = document.querySelector('.prompt-editor-host .cm-scroller');
  if (!editor || !(scroller instanceof HTMLElement)) {
    return null;
  }
  const rect = scroller.getBoundingClientRect();
  if (rect.height <= 0) {
    return null;
  }
  const position = editor.getDocumentPositionAtViewportY(rect.top + rect.height * 0.35);
  if (typeof position !== 'number') {
    return null;
  }
  return { from: position, to: position };
}

export function syncParagraphMarkerToReadingPosition(props: WorkspaceLayoutProps) {
  const editor = props.editorAdapterRef.current;
  if (!editor) {
    return;
  }
  const currentSelection = getReadingPositionSelection(props, editor.getSelection());
  editor.setParagraphMarker?.(resolveCurrentParagraphSelection(editor.getContent(), currentSelection));
}

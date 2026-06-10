import type { MutableRefObject } from 'react';

import type { EditorAdapter } from '../../features/editor/adapters/EditorAdapter';
import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/diagnostics/debugTrace';
import type { NodeViewState } from '../../store/workspaceStore';

import { resolveCurrentParagraphSelection } from './immersiveReadingModel';

type ImmersiveEditorRef = MutableRefObject<EditorAdapter | null>;

interface ReadingPositionSelectionSource {
  editorNodeViewState?: NodeViewState | undefined;
  getReadingPositionSelection: () => EditorSelection | null;
}

interface ViewportReadingSource {
  activeNodeId: string | null;
  editorAdapterRef: ImmersiveEditorRef;
}

type ReadingMarkerSource = ReadingPositionSelectionSource & ViewportReadingSource;

export function focusImmersiveEditor(editorAdapterRef: ImmersiveEditorRef) {
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

export function clearParagraphMarker(editorAdapterRef: ImmersiveEditorRef) {
  editorAdapterRef.current?.setParagraphMarker?.(null);
}

export function getReadingPositionSelection(
  props: ReadingPositionSelectionSource,
  currentSelection: EditorSelection
) {
  const runtimeSelection = props.getReadingPositionSelection();
  if (runtimeSelection) {
    return runtimeSelection;
  }
  if (currentSelection.from !== 0 || currentSelection.to !== 0) {
    return currentSelection;
  }
  const persistedSelection = props.editorNodeViewState?.selection;
  if (!persistedSelection) {
    return currentSelection;
  }
  return persistedSelection;
}

function getViewportReadingPosition(props: ViewportReadingSource) {
  const editor = props.editorAdapterRef.current;
  const visiblePosition = editor?.getPrimaryVisiblePosition?.();
  if (typeof visiblePosition === 'number') {
    pushDebugTrace('immersive.viewport-reading.sampled', {
      activeNodeId: props.activeNodeId,
      position: visiblePosition
    });
    return visiblePosition;
  }
  const viewportRect = editor?.getViewportRect?.();
  if (!editor || !viewportRect || viewportRect.height <= 0) {
    return null;
  }
  const preferredY = resolveTopVisibleLineSampleY(viewportRect);
  const position = editor.getDocumentPositionAtViewportY(preferredY);
  pushDebugTrace('immersive.viewport-reading.sampled', {
    activeNodeId: props.activeNodeId,
    position
  });
  return position;
}

function resolveTopVisibleLineSampleY(scrollerRect: DOMRect) {
  return scrollerRect.top + Math.max(scrollerRect.height * 0.15, 12);
}

export function getViewportReadingSelection(props: ViewportReadingSource) {
  const editor = props.editorAdapterRef.current;
  const position = getViewportReadingPosition(props);
  if (!editor || typeof position !== 'number') {
    return null;
  }
  return { from: position, to: position };
}

export function syncParagraphMarkerToReadingPosition(props: ReadingMarkerSource) {
  const editor = props.editorAdapterRef.current;
  if (!editor) {
    return;
  }
  const currentSelection = getReadingPositionSelection(props, editor.getSelection());
  editor.setParagraphMarker?.(resolveCurrentParagraphSelection(editor.getContent(), currentSelection));
}

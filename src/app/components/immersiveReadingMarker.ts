import type { EditorSelection } from '../../features/editor/adapters/EditorAdapter';
import { pushDebugTrace } from '../../shared/testing/debugBridge';

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

export function getViewportReadingPosition(props: WorkspaceLayoutProps) {
  const editor = props.editorAdapterRef.current;
  const sampledLineText = getViewportSampleLineText();
  const visiblePosition = editor?.getPrimaryVisiblePosition?.();
  if (typeof visiblePosition === 'number') {
    pushDebugTrace('immersive.viewport-reading.sampled', {
      activeNodeId: props.activeNodeId,
      lineText: sampledLineText,
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
    lineText: sampledLineText,
    position
  });
  return position;
}

function getViewportSampleLineText() {
  const scroller = document.querySelector('.prompt-editor-host .cm-scroller');
  if (!(scroller instanceof HTMLElement)) {
    return null;
  }
  const rect = scroller.getBoundingClientRect();
  const anchorY = rect.top + rect.height * 0.15;
  const lines = Array.from(document.querySelectorAll('.prompt-editor-host .cm-line'))
    .map((line) => line as HTMLElement)
    .map((line) => {
      const lineRect = line.getBoundingClientRect();
      return {
        distance: Math.abs((lineRect.top + lineRect.bottom) / 2 - anchorY),
        text: (line.textContent ?? '').trim()
      };
    })
    .filter((line) => line.text.length > 0)
    .sort((left, right) => left.distance - right.distance);
  return lines[0]?.text ?? null;
}

function resolveTopVisibleLineSampleY(scrollerRect: DOMRect) {
  return scrollerRect.top + Math.max(scrollerRect.height * 0.15, 12);
}

export function getViewportReadingSelection(props: WorkspaceLayoutProps) {
  const editor = props.editorAdapterRef.current;
  const position = getViewportReadingPosition(props);
  if (!editor || typeof position !== 'number') {
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

export function syncReadingSelectionToViewport(props: WorkspaceLayoutProps) {
  const editor = props.editorAdapterRef.current;
  const position = getViewportReadingPosition(props);
  if (!editor || typeof position !== 'number') {
    return null;
  }
  const currentSelection = editor.getSelection();
  if (currentSelection.from === position && currentSelection.to === position) {
    return currentSelection;
  }
  const selection = { from: position, to: position };
  editor.setSelection(selection);
  syncParagraphMarkerToReadingPosition(props);
  return selection;
}

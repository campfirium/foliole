import { EditorView, type EditorView as CodeMirrorView } from '@codemirror/view';

import { pushDebugTrace } from '../../../shared/testing/debugBridge';

import { alignSelectionInViewport } from './codeMirrorEditorAdapterView';
import type { EditorSelection } from './EditorAdapter';

export function revealEditorSelection(
  view: CodeMirrorView,
  selection: EditorSelection,
  clampPosition: (position: number) => number,
  targetRatio?: number
) {
  const anchor = clampPosition(selection.from);
  const head = clampPosition(selection.to);
  pushDebugTrace(targetRatio == null ? 'editor.viewport.reveal-selection' : 'editor.viewport.reveal-selection-ratio', {
    ratio: targetRatio ?? null,
    scrollTop: view.scrollDOM.scrollTop,
    selection: { from: anchor, to: head }
  });
  view.dispatch({
    selection: { anchor, head },
    scrollIntoView: targetRatio == null
  });
  view.focus();
  alignSelectionInViewport(view, anchor, targetRatio);
}

export function revealEditorSelectionCentered(
  view: CodeMirrorView,
  selection: EditorSelection,
  clampPosition: (position: number) => number
) {
  const anchor = clampPosition(selection.from);
  const head = clampPosition(selection.to);
  pushDebugTrace('editor.viewport.reveal-selection-center', {
    scrollTop: view.scrollDOM.scrollTop,
    selection: { from: anchor, to: head }
  });
  view.dispatch({
    effects: EditorView.scrollIntoView(anchor, { y: 'center' }),
    selection: { anchor, head },
    scrollIntoView: false
  });
  view.focus();
}

export function revealEditorSelectionNearest(
  view: CodeMirrorView,
  selection: EditorSelection,
  clampPosition: (position: number) => number
) {
  const anchor = clampPosition(selection.from);
  const head = clampPosition(selection.to);
  pushDebugTrace('editor.viewport.reveal-selection-nearest', {
    scrollTop: view.scrollDOM.scrollTop,
    selection: { from: anchor, to: head }
  });
  view.dispatch({
    effects: EditorView.scrollIntoView(anchor, { y: 'nearest' }),
    selection: { anchor, head },
    scrollIntoView: false
  });
  view.focus();
}

export function restoreEditorSelection(
  view: CodeMirrorView,
  selection: EditorSelection,
  clampPosition: (position: number) => number
) {
  const anchor = clampPosition(selection.from);
  const head = clampPosition(selection.to);
  pushDebugTrace('editor.viewport.restore-selection', {
    scrollTop: view.scrollDOM.scrollTop,
    selection: { from: anchor, to: head }
  });
  view.dispatch({
    selection: {
      anchor,
      head
    },
    scrollIntoView: true
  });
}

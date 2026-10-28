import { historyField, isolateHistory, redo, undo } from '@codemirror/commands';
import { EditorState, type Transaction } from '@codemirror/state';

import { nativeTextHistoryBoundary, nativeTextHistoryExtensions, nativeTextHistoryGroups, nativeTextHistoryInputFilter } from './nativeTextHistoryGroups';

export type NativeTextHistoryMode = 'redo' | 'undo';

/** Share CM's immutable text and opaque history without copying View fields or serializing. */
export function captureNativeTextHistory(state: EditorState) {
  const history = state.field(historyField);
  const groups = state.field(nativeTextHistoryGroups);
  return EditorState.create({ doc: state.doc, selection: state.selection, extensions: [
    EditorState.allowMultipleSelections.of(true), nativeTextHistoryExtensions, nativeTextHistoryInputFilter(),
    historyField.init(() => history), nativeTextHistoryGroups.init(() => groups)
  ] });
}

export function isolateNativeTextHistory(state: EditorState) {
  return state.update({ effects: nativeTextHistoryBoundary.of(true), annotations: isolateHistory.of('full') }).state;
}

export function runNativeTextHistory(state: EditorState, mode: NativeTextHistoryMode, group?: object): Transaction | null {
  const groups = state.field(nativeTextHistoryGroups);
  if (group && (mode === 'undo' ? groups.undo : groups.redo).at(-1) !== group) return null;
  let result: Transaction | null = null;
  (mode === 'undo' ? undo : redo)({ state, dispatch: tr => { result = tr; } });
  return result;
}

/** External-content boundary only: probing never mutates the saved canonical branch. */
export function findNativeTextHistory(state: EditorState, content: string) {
  if (state.doc.toString() === content) return state;
  for (const mode of ['undo', 'redo'] as const) {
    let candidate = state;
    for (let index = 0; index < 500; index++) {
      const tr = runNativeTextHistory(candidate, mode);
      if (!tr) break;
      candidate = tr.state;
      if (candidate.doc.toString() === content) return candidate;
    }
  }
  return null;
}

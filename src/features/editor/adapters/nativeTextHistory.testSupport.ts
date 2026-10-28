import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';

import { getEditorTextHistorySource } from '../model/editorNativeOperationHistory';
import { createEmptyEditorOperationHistory, getEditorOperationTopEntry, moveEditorOperationEntry, pushEditorOperationEntry,
  type EditorOperationHistoryState, type EditorTextHistoryInput } from '../model/editorOperationHistory';

import { CodeMirrorTextHistoryController } from './codeMirrorTextHistory';

export function nativeHistoryTestView(content: string, extensions: Extension = [], nodeId = 'node-1') {
  let history = createEmptyEditorOperationHistory();
  let external = false;
  const entries: EditorTextHistoryInput[] = [];
  const controller = new CodeMirrorTextHistoryController({ discardPending: () => {}, getNodeId: () => nodeId,
    isApplyingExternalContent: () => external, setApplyingExternalContent: value => { external = value; } });
  const view = new EditorView({ parent: document.body, state: EditorState.create({ doc: content,
    selection: { anchor: content.length }, extensions: [controller.extension({ initialContent: content }), extensions,
      EditorView.updateListener.of(update => {
        if (external || controller.isApplying()) return;
        for (const input of controller.collect(update, nodeId)) {
          entries.push(input);
          history = pushEditorOperationEntry(history, input);
        }
      })] }) });
  controller.bind(id => getEditorTextHistorySource(history, id), view);
  return { controller, entries, view, text: () => view.state.doc.toString(),
    getHistory: () => history, setHistory: (next: EditorOperationHistoryState) => { history = next; },
    top: (mode: 'redo' | 'undo') => getEditorOperationTopEntry(history, nodeId, mode),
    setContent: (next: string) => controller.setContent(next, view),
    replay(mode: 'redo' | 'undo') {
      const entry = getEditorOperationTopEntry(history, nodeId, mode);
      if (entry?.type !== 'text.edit') return false;
      const result = controller.apply(entry, mode, view);
      if (!result) return false;
      history = moveEditorOperationEntry(history, nodeId, mode, result.nativeState);
      return true;
    }
  };
}

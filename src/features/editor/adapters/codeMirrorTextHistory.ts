import { historyField } from '@codemirror/commands';
import { Compartment, Prec, Transaction, type EditorState } from '@codemirror/state';
import { EditorView, type ViewUpdate } from '@codemirror/view';

import { editorHistorySelection } from '../model/editorNativeOperationHistory';
import type { EditorOperationSelectionSnapshot, EditorTextEditOperationEntry, EditorTextHistoryInput } from '../model/editorOperationHistory';
import { captureNativeTextHistory, findNativeTextHistory, isolateNativeTextHistory, runNativeTextHistory } from '../model/nativeTextHistory';
import { isHistoricalTextInput, nativeTextHistoryExtensions, nativeTextHistoryGroups, nativeTextHistoryInputFilter } from '../model/nativeTextHistoryGroups';

import type { CodeMirrorEditorAdapterOptions } from './codeMirrorEditorAdapterSupport';
import { applyExternalEditorContent } from './codeMirrorEditorMutations';
import type { EditorTextHistorySource } from './EditorAdapter';

let inputOrder = 0;

function selection(value: import('@codemirror/state').EditorSelection): EditorOperationSelectionSnapshot {
  return { mainIndex: value.mainIndex, ranges: value.ranges.map(({ anchor, head }) => ({ anchor, head })) };
}

export function collectCodeMirrorTextHistoryEntries(update: ViewUpdate, nodeId: string | null) {
  if (!nodeId) return [];
  return update.transactions.filter(isHistoricalTextInput).map((tr): EditorTextHistoryInput => ({
    type: 'text.input', inputOrder: ++inputOrder, nodeId, title: 'Edit Text', beforeDoc: tr.startState.doc, changes: tr.changes,
    nativeBefore: tr.startState.field(nativeTextHistoryGroups), nativeState: captureNativeTextHistory(tr.state),
    beforeSelection: selection(tr.startState.selection), afterSelection: selection(tr.newSelection),
    timestamp: tr.annotation(Transaction.time) ?? Date.now(), userEvent: tr.annotation(Transaction.userEvent)!
  }));
}

export class CodeMirrorTextHistoryController {
  private applying = false;
  private documentId: string | null = null;
  private latest: EditorState | null = null;
  private source: EditorTextHistorySource | null = null;
  private readonly slot = new Compartment();

  constructor(private readonly guards: {
    discardPending: () => void;
    getNodeId: () => string | null;
    isApplyingExternalContent: () => boolean;
    setApplyingExternalContent: (value: boolean) => void;
  }) {}

  extension(options: CodeMirrorEditorAdapterOptions) {
    return [this.slot.of(nativeTextHistoryExtensions),
      nativeTextHistoryInputFilter(() => this.source?.(this.guards.getNodeId())?.boundary ?? null),
      Prec.highest(EditorView.domEventHandlers({ beforeinput: event => {
        if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return false;
        if (!event.defaultPrevented) (event.inputType === 'historyUndo' ? options.onUndo : options.onRedo)?.();
        event.preventDefault();
        return true;
      } }))];
  }

  isApplying() { return this.applying; }

  bind(source: EditorTextHistorySource, view: EditorView) {
    this.source = source;
    this.documentId = this.guards.getNodeId();
    this.restore(view);
  }

  nodeChanged(view: EditorView) {
    if (this.documentId === this.guards.getNodeId()) return;
    this.documentId = this.guards.getNodeId();
    this.latest = null;
    this.restore(view);
  }

  collect(update: ViewUpdate, nodeId: string | null) {
    const entries = collectCodeMirrorTextHistoryEntries(update, nodeId);
    if (entries.length) this.latest = entries.at(-1)!.nativeState!;
    this.documentId = nodeId;
    return entries;
  }

  private install(view: EditorView, state: EditorState | null) {
    view.dispatch({ effects: this.slot.reconfigure([]) });
    view.dispatch({ effects: this.slot.reconfigure(state ? [nativeTextHistoryExtensions,
      historyField.init(() => state.field(historyField)),
      nativeTextHistoryGroups.init(() => state.field(nativeTextHistoryGroups))] : nativeTextHistoryExtensions) });
  }

  private restore(view: EditorView, canonical = this.source?.(this.guards.getNodeId())?.state ?? this.latest) {
    const state = canonical ? findNativeTextHistory(canonical, view.state.doc.toString()) : null;
    this.install(view, state ? isolateNativeTextHistory(state) : null);
  }

  setContent(content: string, view: EditorView) {
    this.nodeChanged(view);
    const currentContent = view.state.doc.toString();
    if (currentContent === content) return;
    const canonical = this.source?.(this.guards.getNodeId())?.state ?? this.latest;
    this.guards.setApplyingExternalContent(true);
    try { applyExternalEditorContent({ content, currentContent, view }); }
    finally { this.guards.setApplyingExternalContent(false); }
    this.restore(view, canonical);
  }

  settle(view: EditorView) {
    const canonical = this.source?.(this.guards.getNodeId())?.state;
    // A content flush can discard unsaved edits whose net result equals the saved body.
    if (!canonical || !canonical.doc.eq(view.state.doc) ||
      canonical.field(historyField) === view.state.field(historyField)) return;
    this.latest = canonical;
    this.install(view, isolateNativeTextHistory(canonical));
  }

  runExternal(view: EditorView, apply: () => void) {
    const canonical = this.source?.(this.guards.getNodeId())?.state ?? this.latest;
    apply();
    this.restore(view, canonical);
  }

  apply(entry: EditorTextEditOperationEntry, mode: 'redo' | 'undo', view: EditorView) {
    if (entry.nodeId !== this.guards.getNodeId() || this.guards.isApplyingExternalContent() || this.applying ||
      !entry.nativeState || !view.state.doc.eq(entry.nativeState.doc)) return false;
    if (view.state.field(historyField) !== entry.nativeState.field(historyField)) this.install(view, entry.nativeState);
    const candidate = runNativeTextHistory(view.state.readOnly ? entry.nativeState : view.state, mode, entry.nativeGroup);
    if (!candidate) return false;
    const tr = candidate.startState === view.state ? candidate : view.state.update(candidate, { filter: false });
    this.applying = true;
    try {
      view.dispatch(tr);
      if (!view.state.doc.eq(tr.newDoc)) return false;
      if (mode === 'redo') view.dispatch({ selection: editorHistorySelection(entry.afterSelection),
        annotations: Transaction.addToHistory.of(false), scrollIntoView: true });
      this.latest = captureNativeTextHistory(view.state);
      this.guards.discardPending();
      return { nativeState: this.latest };
    } catch { return false; }
    finally { this.applying = false; }
  }
}

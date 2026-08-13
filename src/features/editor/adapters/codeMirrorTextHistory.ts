import { EditorSelection, Transaction, type ChangeSet } from '@codemirror/state';
import type { EditorView, ViewUpdate } from '@codemirror/view';

import type {
  EditorOperationSelectionSnapshot,
  EditorTextEditOperationEntry
} from '../model/editorOperationHistory';

const USER_TEXT_EVENT = /^(input|delete|move)($|\.)/;

function toSelectionSnapshot(selection: EditorSelection): EditorOperationSelectionSnapshot {
  return {
    mainIndex: selection.mainIndex,
    ranges: selection.ranges.map(({ anchor, head }) => ({ anchor, head }))
  };
}

function fromSelectionSnapshot(snapshot: EditorOperationSelectionSnapshot) {
  return EditorSelection.create(
    snapshot.ranges.map(({ anchor, head }) => EditorSelection.range(anchor, head)),
    snapshot.mainIndex
  );
}

export function collectCodeMirrorTextHistoryEntries(update: ViewUpdate, nodeId: string | null) {
  if (!nodeId) return [];
  return update.transactions.flatMap((transaction): EditorTextEditOperationEntry[] => {
    const userEvent = transaction.annotation(Transaction.userEvent) ?? '';
    if (
      !transaction.docChanged ||
      transaction.annotation(Transaction.addToHistory) === false ||
      !USER_TEXT_EVENT.test(userEvent)
    ) {
      return [];
    }
    return [{
      afterContent: transaction.newDoc.toString(),
      afterSelection: toSelectionSnapshot(transaction.newSelection),
      beforeContent: transaction.startState.doc.toString(),
      beforeSelection: toSelectionSnapshot(transaction.startState.selection),
      forwardChanges: transaction.changes,
      inverseChanges: transaction.changes.invert(transaction.startState.doc),
      nodeId,
      timestamp: transaction.annotation(Transaction.time) ?? Date.now(),
      title: 'Edit Text',
      type: 'text.edit',
      userEvent
    }];
  });
}

export function applyCodeMirrorTextHistory(args: {
  changes: ChangeSet;
  expectedContent: string;
  expectedNextContent: string;
  selection: EditorOperationSelectionSnapshot;
  userEvent: 'redo' | 'undo';
  view: EditorView;
}) {
  if (args.view.state.doc.toString() !== args.expectedContent) return false;
  try {
    args.view.dispatch({
      annotations: Transaction.addToHistory.of(false),
      changes: args.changes,
      scrollIntoView: true,
      selection: fromSelectionSnapshot(args.selection),
      userEvent: args.userEvent
    });
  } catch {
    return false;
  }
  return args.view.state.doc.toString() === args.expectedNextContent;
}

export class CodeMirrorTextHistoryController {
  private applying = false;

  constructor(private readonly guards: {
    discardPending: () => void;
    getNodeId: () => string | null;
    isApplyingExternalContent: () => boolean;
  }) {}

  isApplying() {
    return this.applying;
  }

  apply(entry: EditorTextEditOperationEntry, mode: 'redo' | 'undo', view: EditorView) {
    if (entry.nodeId !== this.guards.getNodeId() || this.guards.isApplyingExternalContent() || this.applying) {
      return false;
    }
    const replay = mode === 'undo'
      ? {
          changes: entry.inverseChanges,
          expectedContent: entry.afterContent,
          expectedNextContent: entry.beforeContent,
          selection: entry.beforeSelection
        }
      : {
          changes: entry.forwardChanges,
          expectedContent: entry.beforeContent,
          expectedNextContent: entry.afterContent,
          selection: entry.afterSelection
        };
    this.applying = true;
    try {
      const applied = applyCodeMirrorTextHistory({ ...replay, userEvent: mode, view });
      if (applied) this.guards.discardPending();
      return applied;
    } finally {
      this.applying = false;
    }
  }
}

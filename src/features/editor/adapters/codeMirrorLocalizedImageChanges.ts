import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type { LocalizedImageChange } from './localizeRemoteMarkdownImages';

export function applyCodeMirrorLocalizedImageChanges(args: {
  changes: LocalizedImageChange[];
  contentSnapshot: string;
  view: EditorView;
  setApplyingExternalContent: (value: boolean) => void;
}) {
  if (args.view.state.doc.toString() !== args.contentSnapshot) return;
  args.setApplyingExternalContent(true);
  try {
    args.view.dispatch({ annotations: Transaction.addToHistory.of(false), changes: args.changes });
  } finally {
    args.setApplyingExternalContent(false);
  }
}

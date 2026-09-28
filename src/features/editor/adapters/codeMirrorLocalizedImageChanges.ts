import { Transaction } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type { LocalizedImageChange } from './localizeRemoteMarkdownImages';
import { retainDisplayedRemoteImageSources } from './retainedRemoteImageDisplay';

export function applyCodeMirrorLocalizedImageChanges(args: {
  changes: LocalizedImageChange[];
  contentSnapshot: string;
  nodeId: string | null;
  retainDisplay: boolean | undefined;
  view: EditorView;
  setApplyingExternalContent: (value: boolean) => void;
}) {
  if (args.view.state.doc.toString() !== args.contentSnapshot) return;
  if (args.retainDisplay !== false) retainDisplayedRemoteImageSources(args.nodeId, args.contentSnapshot, args.changes);
  args.setApplyingExternalContent(true);
  try {
    args.view.dispatch({ annotations: Transaction.addToHistory.of(false), changes: args.changes });
  } finally {
    args.setApplyingExternalContent(false);
  }
}

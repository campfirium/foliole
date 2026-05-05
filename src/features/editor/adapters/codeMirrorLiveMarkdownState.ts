import { type Compartment } from '@codemirror/state';
import { type EditorView } from '@codemirror/view';

import { dispatchLiveMarkdownReconfigure } from './codeMirrorEditorAdapterSupport';

export function applyLiveMarkdownState(args: {
  compartment: Compartment;
  hiddenTextAnchorKeys: readonly string[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  nodeId: string | null;
  onOpenNodeLink: ((title: string) => void) | null;
  view: EditorView;
}) {
  dispatchLiveMarkdownReconfigure(args);
}

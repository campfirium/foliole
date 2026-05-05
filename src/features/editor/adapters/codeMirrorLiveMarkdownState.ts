import { type Compartment } from '@codemirror/state';
import { type EditorView } from '@codemirror/view';

import { dispatchLiveMarkdownReconfigure } from './codeMirrorEditorAdapterSupport';
import type { EditorTextAnchorDecoration } from './EditorAdapter';

export function applyLiveMarkdownState(args: {
  liveMarkdownStateCompartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  nodeId: string | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPastedAnchors?: ((payload: { anchors: import('../model/anchorClipboardPayload').ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
  view: EditorView;
}) {
  dispatchLiveMarkdownReconfigure({
    compartment: args.liveMarkdownStateCompartment,
    textAnchorDecorations: args.textAnchorDecorations,
    hideTitleHeading: args.hideTitleHeading,
    imageClozePresentationVersion: args.imageClozePresentationVersion,
    nodeId: args.nodeId,
    onOpenNodeLink: args.onOpenNodeLink,
    onPastedAnchors: args.onPastedAnchors ?? null,
    view: args.view
  });
}

import { type Compartment } from '@codemirror/state';
import { type EditorView } from '@codemirror/view';

import { dispatchLiveMarkdownReconfigure } from './codeMirrorEditorAdapterSupport';
import type { EditorTextAnchorPresentation } from './EditorAdapter';

export function applyLiveMarkdownState(args: {
  liveMarkdownStateCompartment: Compartment;
  textAnchorPresentation: EditorTextAnchorPresentation;
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  nodeId: string | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPastedAnchors?: ((payload: { anchors: import('../model/anchorClipboardPayload').ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
  view: EditorView;
}) {
  dispatchLiveMarkdownReconfigure({
    compartment: args.liveMarkdownStateCompartment,
    textAnchorPresentation: args.textAnchorPresentation,
    hideTitleHeading: args.hideTitleHeading,
    imageClozePresentationVersion: args.imageClozePresentationVersion,
    nodeId: args.nodeId,
    onOpenNodeLink: args.onOpenNodeLink,
    onPastedAnchors: args.onPastedAnchors ?? null,
    view: args.view
  });
}

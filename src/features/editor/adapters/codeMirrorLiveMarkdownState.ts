import { type Compartment } from '@codemirror/state';
import { type EditorView } from '@codemirror/view';

import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';

import { dispatchLiveMarkdownReconfigure } from './codeMirrorEditorAdapterSupport';
import type { EditorTextAnchorDecoration } from './EditorAdapter';

export function applyLiveMarkdownState(args: {
  liveMarkdownStateCompartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  nodeId: string | null;
  onOpenExternalLink?: ((request: ExternalLinkOpenRequest) => void) | null;
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
    onOpenExternalLink: args.onOpenExternalLink ?? null,
    onOpenNodeLink: args.onOpenNodeLink,
    onPastedAnchors: args.onPastedAnchors ?? null,
    view: args.view
  });
}

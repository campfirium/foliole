import { type Compartment } from '@codemirror/state';
import { type EditorView } from '@codemirror/view';

import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';

import { dispatchLiveMarkdownReconfigure } from './codeMirrorEditorAdapterSupport';
import type { EditorMissingAttachmentResourceHandler, EditorTextAnchorDecoration } from './EditorAdapter';

export function applyLiveMarkdownState(args: {
  liveMarkdownStateCompartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  nodeId: string | null;
  onMissingAttachmentResource?: EditorMissingAttachmentResourceHandler | null;
  onOpenExternalLink?: ((request: ExternalLinkOpenRequest) => void) | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPreviewNodeLink?: ((request: EditorNodeLinkPreviewRequest | null) => void) | null;
  onPastedAnchors?: ((payload: { anchors: import('../model/anchorClipboardPayload').ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
  view: EditorView;
}) {
  dispatchLiveMarkdownReconfigure({
    compartment: args.liveMarkdownStateCompartment,
    textAnchorDecorations: args.textAnchorDecorations,
    hideTitleHeading: args.hideTitleHeading,
    imageClozePresentationVersion: args.imageClozePresentationVersion,
    nodeId: args.nodeId,
    onMissingAttachmentResource: args.onMissingAttachmentResource ?? null,
    onOpenExternalLink: args.onOpenExternalLink ?? null,
    onOpenNodeLink: args.onOpenNodeLink,
    onPreviewNodeLink: args.onPreviewNodeLink ?? null,
    onPastedAnchors: args.onPastedAnchors ?? null,
    view: args.view
  });
}

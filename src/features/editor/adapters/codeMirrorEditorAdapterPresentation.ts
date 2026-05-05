import type { Compartment } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';

import { syncEditorLiveMarkdownState, syncEditorTextAnchorDecorations } from './codeMirrorEditorAdapterState';
import type { EditorMissingAttachmentResourceHandler, EditorTextAnchorDecoration } from './EditorAdapter';

export function applyAdapterTextAnchorDecorations(args: {
  compartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  view: EditorView;
}) {
  syncEditorTextAnchorDecorations(args);
}

export function reconfigureAdapterLiveMarkdownState(args: {
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
  syncEditorLiveMarkdownState(args);
}

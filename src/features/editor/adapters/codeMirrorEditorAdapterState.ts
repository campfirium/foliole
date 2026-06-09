import type { Compartment } from '@codemirror/state';
import type { EditorView } from '@codemirror/view';

import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';

import { applyLiveMarkdownState } from './codeMirrorLiveMarkdownState';
import { applyEditorTextAnchorDecorations } from './codeMirrorTextAnchorPresentation';
import type { EditorMissingAttachmentResourceHandler, EditorTextAnchorDecoration } from './EditorAdapter';

export function syncEditorTextAnchorDecorations(args: {
  compartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  view: EditorView;
}) {
  applyEditorTextAnchorDecorations(args);
}

export function syncEditorLiveMarkdownState(args: {
  liveMarkdownStateCompartment: Compartment;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  localDocumentPath?: string | null;
  nodeId: string | null;
  onMissingAttachmentResource?: EditorMissingAttachmentResourceHandler | null;
  onOpenExternalLink?: ((request: ExternalLinkOpenRequest) => void) | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPreviewNodeLink?: ((request: EditorNodeLinkPreviewRequest | null) => void) | null;
  onPastedAnchors?: ((payload: { anchors: import('../model/anchorClipboardPayload').ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
  view: EditorView;
}) {
  applyLiveMarkdownState(args);
}

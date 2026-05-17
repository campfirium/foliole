import type { EditorView } from '@codemirror/view';

import type { ExternalLinkOpenRequest } from '../../../shared/platform/externalLinkOpenRequest';
import type { EditorNodeLinkPreviewRequest } from '../model/nodeLinkPreview';

import { reconfigureAdapterLiveMarkdownState } from './codeMirrorEditorAdapterPresentation';
import type { EditorMissingAttachmentResourceHandler, EditorTextAnchorDecoration } from './EditorAdapter';

export function reconfigureCodeMirrorLiveMarkdown(args: {
  hideTitleHeading: boolean;
  imageClozePresentationVersion: number;
  liveMarkdownStateCompartment: import('@codemirror/state').Compartment;
  nodeId: string | null;
  onMissingAttachmentResource: EditorMissingAttachmentResourceHandler | null;
  onOpenExternalLink: ((request: ExternalLinkOpenRequest) => void) | null;
  onOpenNodeLink: ((title: string) => void) | null;
  onPreviewNodeLink: ((request: EditorNodeLinkPreviewRequest | null) => void) | null;
  onPastedAnchors: ((payload: { anchors: import('../model/anchorClipboardPayload').ClipboardAnchorRange[]; content: string; nodeId: string }) => void) | null;
  textAnchorDecorations: readonly EditorTextAnchorDecoration[];
  view: EditorView;
}) {
  reconfigureAdapterLiveMarkdownState(args);
}

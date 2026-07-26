import type { Node } from '../../features/nodes/model/nodeTypes';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';

export type DocumentComparisonMode =
  | 'manual'
  | 'source_preview'
  | 'incoming_update'
  | 'sync_alternative';

export interface DocumentComparisonEligibility {
  activeNode: Node | undefined;
  activeNodeId: string | null;
  editorNodeId: string | null;
  isEditorReadOnly: boolean;
  isExternalViewOpen: boolean;
  isFoliolePublishedContext: boolean;
  isImmersiveMode: boolean;
  isReviewOnly: boolean;
  isTrashViewOpen: boolean;
}

function hasPdfDocumentSurface(node: Node) {
  return node.attachments?.some((attachment) => attachment.mimeType === 'application/pdf') ?? false;
}

export function canOpenDocumentComparisonView(args: DocumentComparisonEligibility) {
  const node = args.activeNode;
  return Boolean(
    node &&
      node.id === args.activeNodeId &&
      node.id === args.editorNodeId &&
      node.kind === 'topic' &&
      !node.anchorLink &&
      isNodeDocumentLoaded(node) &&
      !hasPdfDocumentSurface(node) &&
      !args.isEditorReadOnly &&
      !args.isExternalViewOpen &&
      !args.isFoliolePublishedContext &&
      !args.isImmersiveMode &&
      !args.isReviewOnly &&
      !args.isTrashViewOpen
  );
}

export const DOCUMENT_COMPARISON_VIEW_TOGGLE_EVENT = 'foliole:document-comparison-view-toggle';

export type DocumentComparisonSource = 'manual' | 'source';

export function requestDocumentComparisonView(source: DocumentComparisonSource) {
  window.dispatchEvent(new CustomEvent(DOCUMENT_COMPARISON_VIEW_TOGGLE_EVENT, { detail: { source } }));
}

export function requestDocumentComparisonViewToggle() {
  requestDocumentComparisonView('manual');
}

export function requestSourceUpdateReview() {
  requestDocumentComparisonView('source');
}

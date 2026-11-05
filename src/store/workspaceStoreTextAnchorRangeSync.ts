import { isTextAnchorLocator, type Node, type TextAnchorLocator } from '../features/nodes/model/nodeTypes';
import { loadWorkspaceNodeDocumentFromRuntime } from '../shared/platform/workspaceRuntimeDocumentRepository';
import { buildUpdatedClozeFields } from '../shared/textAnchorClozeRange';
import { resolveSyncedHighlightContent } from '../shared/textAnchorRangeUpdate';

import { writeCachedWorkspaceNodeDocument } from './workspaceNodeDocumentCache';
import { mergeWorkspaceNodeDocument, type WorkspaceNodeDocument } from './workspaceRendererBoundary';
import { syncNodeContentToRuntime } from './workspaceRuntimeSync';
import type { WorkspaceState } from './workspaceStore';
export { buildUpdatedTextAnchorNode, type TextAnchorRangeUpdate } from '../shared/textAnchorRangeUpdate';

type WorkspaceSet = (partial: WorkspaceState | Partial<WorkspaceState> | ((state: WorkspaceState) => WorkspaceState | Partial<WorkspaceState>)) => void;

function resolveSyncedUnloadedTextAnchorDocument(args: {
  document: WorkspaceNodeDocument;
  nextNode: Node;
  parentContent: string;
  previousLocator: TextAnchorLocator;
}) {
  const locator = args.nextNode.anchorLink?.locator;
  if (!isTextAnchorLocator(locator)) {
    return null;
  }
  if (args.nextNode.anchorLink?.kind === 'highlight') {
    const content = resolveSyncedHighlightContent(
      args.document.content,
      args.previousLocator.originalText,
      locator.originalText
    );
    return content === null ? null : { ...args.document, content };
  }
  const syncedFields = buildUpdatedClozeFields({
    locator,
    node: { ...args.nextNode, content: args.document.content, reveal: args.document.reveal },
    parentContent: args.parentContent,
    previousLocator: args.previousLocator
  });
  const hasDocumentChange = 'content' in syncedFields || 'reveal' in syncedFields;
  if (!hasDocumentChange) {
    return null;
  }
  return {
    ...args.document,
    ...('content' in syncedFields ? { content: syncedFields.content } : {}),
    ...('reveal' in syncedFields ? { reveal: syncedFields.reveal } : {})
  };
}

export async function syncUnloadedTextAnchorContent(args: {
  nextNode: Node;
  parentContent: string;
  previousLocator: TextAnchorLocator;
  set: WorkspaceSet;
}) {
  const document = await loadWorkspaceNodeDocumentFromRuntime(args.nextNode.id).catch(() => null);
  if (!document) {
    return;
  }
  const nextDocument = resolveSyncedUnloadedTextAnchorDocument({
    document,
    nextNode: args.nextNode,
    parentContent: args.parentContent,
    previousLocator: args.previousLocator
  });
  if (nextDocument === null) {
    syncNodeContentToRuntime(mergeWorkspaceNodeDocument(args.nextNode, document));
    return;
  }
  const hydratedNode = mergeWorkspaceNodeDocument(args.nextNode, nextDocument);
  writeCachedWorkspaceNodeDocument(args.nextNode.id, nextDocument);
  args.set((state) => {
    const currentNode = state.nodesById[args.nextNode.id];
    if (!currentNode || currentNode.updatedAt !== args.nextNode.updatedAt) {
      return state;
    }
    return {
      nodesById: {
        ...state.nodesById,
        [args.nextNode.id]: hydratedNode
      }
    };
  });
  syncNodeContentToRuntime(hydratedNode);
}

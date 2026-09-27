import type { Node } from '../../features/nodes/model/nodeTypes';
import { logRuntimeWarning } from '../../shared/platform/runtimeLogging';
import { patchWorkspaceRecord } from '../../shared/workspaceRecordPatch';
import { readCachedWorkspaceNodeDocument } from '../../store/workspaceNodeDocumentCache';
import { isWorkspaceNodeDocumentResultCurrent } from '../../store/workspaceNodeDocumentLoader';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { hasPendingNodeSync } from '../../store/workspacePendingNodeSync';
import { isNodeDocumentLoaded, mergeWorkspaceNodeDocument } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

function canShowReadFailure(node: Node | undefined, baseline: Node | undefined, allowMetadataChange = false) {
  return node && baseline
    && !isNodeDocumentLoaded(node)
    && !hasPendingNodeSync(node.id)
    && (allowMetadataChange || node.updatedAt === baseline.updatedAt)
    && node.content === baseline.content
    && node.reveal === baseline.reveal
    && node.bodyStatus === baseline.bodyStatus;
}

async function loadDesktopNodeDocumentAttempt(
  nodeId: string,
  options: NonNullable<Parameters<typeof ensureWorkspaceNodeDocumentReady>[1]>,
  isCurrent: () => boolean,
  staleReadRetries: number
) {
  const baseline = useWorkspaceStore.getState().nodesById[nodeId];
  const cachedDocument = readCachedWorkspaceNodeDocument(nodeId);
  if (!options.forceLoad && cachedDocument && isWorkspaceNodeDocumentResultCurrent(nodeId, cachedDocument)) {
    let restored = false;
    useWorkspaceStore.setState((state) => {
      const node = state.nodesById[nodeId];
      if (!isCurrent() || !node || isNodeDocumentLoaded(node)
        || !isWorkspaceNodeDocumentResultCurrent(nodeId, cachedDocument)) return state;
      restored = true;
      return { nodesById: patchWorkspaceRecord(state.nodesById, {
        [nodeId]: mergeWorkspaceNodeDocument(node, cachedDocument)
      }) };
    });
    if (restored) {
      options.onDocumentMerged?.(cachedDocument);
      options.onLoadResolved?.(cachedDocument);
      return cachedDocument;
    }
  }
  const showReadFailure = (allowMetadataChange = false) => {
    if (!isCurrent() || readCachedWorkspaceNodeDocument(nodeId) !== cachedDocument) return;
    useWorkspaceStore.setState((state) => {
      const node = state.nodesById[nodeId];
      if (!canShowReadFailure(node, baseline, allowMetadataChange) || !node) return state;
      return { nodesById: patchWorkspaceRecord(state.nodesById, {
        [nodeId]: { ...node, bodyStatus: 'failed' }
      }) };
    });
  };
  try {
    const document = await ensureWorkspaceNodeDocumentReady(nodeId, options);
    if (!document) {
      const current = useWorkspaceStore.getState().nodesById[nodeId];
      const metadataChanged = Boolean(current && baseline && current.updatedAt !== baseline.updatedAt);
      if (metadataChanged && staleReadRetries > 0 && isCurrent() && !isNodeDocumentLoaded(current)
        && !hasPendingNodeSync(nodeId)) {
        return loadDesktopNodeDocumentAttempt(nodeId, options, isCurrent, staleReadRetries - 1);
      }
      showReadFailure(metadataChanged);
    }
    return document;
  } catch (error) {
    showReadFailure(true);
    logRuntimeWarning('desktop document read failed', {
      area: 'persistence', action: 'load_node_document',
      fallback: 'keep_document_and_allow_retry', nodeId, error
    });
    return null;
  }
}

export async function loadDesktopNodeDocument(
  nodeId: string,
  options: Parameters<typeof ensureWorkspaceNodeDocumentReady>[1] = {},
  isCurrent = () => useWorkspaceStore.getState().activeNodeId === nodeId
) {
  return loadDesktopNodeDocumentAttempt(nodeId, options ?? {}, isCurrent, 2);
}

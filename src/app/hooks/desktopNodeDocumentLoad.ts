import type { Node } from '../../features/nodes/model/nodeTypes';
import { logRuntimeWarning } from '../../shared/platform/runtimeLogging';
import { patchWorkspaceRecord } from '../../shared/workspaceRecordPatch';
import { readCachedWorkspaceNodeDocument } from '../../store/workspaceNodeDocumentCache';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { hasPendingNodeSync } from '../../store/workspacePendingNodeSync';
import { isNodeDocumentLoaded } from '../../store/workspaceRendererBoundary';
import { useWorkspaceStore } from '../../store/workspaceStore';

function canShowReadFailure(node: Node | undefined, baseline: Node | undefined) {
  return node && baseline
    && !isNodeDocumentLoaded(node)
    && !hasPendingNodeSync(node.id)
    && node.updatedAt === baseline.updatedAt
    && node.content === baseline.content
    && node.reveal === baseline.reveal
    && node.bodyStatus === baseline.bodyStatus;
}

export async function loadDesktopNodeDocument(
  nodeId: string,
  options: Parameters<typeof ensureWorkspaceNodeDocumentReady>[1] = {},
  isCurrent = () => useWorkspaceStore.getState().activeNodeId === nodeId
) {
  const baseline = useWorkspaceStore.getState().nodesById[nodeId];
  const cachedDocument = readCachedWorkspaceNodeDocument(nodeId);
  try {
    return await ensureWorkspaceNodeDocumentReady(nodeId, options);
  } catch (error) {
    if (isCurrent() && readCachedWorkspaceNodeDocument(nodeId) === cachedDocument) {
      useWorkspaceStore.setState((state) => {
        const node = state.nodesById[nodeId];
        if (!canShowReadFailure(node, baseline) || !node) return state;
        return { nodesById: patchWorkspaceRecord(state.nodesById, {
          [nodeId]: { ...node, bodyStatus: 'failed' }
        }) };
      });
    }
    logRuntimeWarning('desktop document read failed', {
      area: 'persistence', action: 'load_node_document',
      fallback: 'keep_document_and_allow_retry', nodeId, error
    });
    return null;
  }
}

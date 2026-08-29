import { addTopicCollection } from '../../../lib/core/nodes/topicCollectionsFrontmatter';
import { isManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import { isVirtualNode } from '../../features/nodes/model/specialNodes';
import { buildVirtualNodeResultIndex } from '../../features/nodes/model/virtualNodeDetail';
import { ensureWorkspaceNodeDocumentReady } from '../../store/workspaceNodePreparation';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { drainPendingNodeContentRuntimePersist } from '../../store/workspaceStoreContentRuntimePersist';

export interface VirtualFolderYamlWriteResult {
  failed: number;
  unchanged: number;
  updated: number;
}

export function isCollectionVirtualFolder(nodeId: string) {
  const node = useWorkspaceStore.getState().nodesById[nodeId];
  const condition = node?.virtualFilter?.conditions[0];
  return Boolean(
    isVirtualNode(node) &&
    node.virtualFilter?.conditions.length === 1 &&
    condition?.field === 'collection' &&
    condition.operator === 'equals' &&
    condition.value === node.title
  );
}

export function canWriteVirtualFolderInfoToTopicYaml(nodeId: string) {
  const node = useWorkspaceStore.getState().nodesById[nodeId];
  return isCollectionVirtualFolder(nodeId) || Boolean(isVirtualNode(node) && isManualVirtualNodeFilter(node.virtualFilter));
}

export async function writeVirtualFolderInfoToTopicYaml(nodeId: string): Promise<VirtualFolderYamlWriteResult> {
  const initial = useWorkspaceStore.getState();
  const folder = initial.nodesById[nodeId];
  if (!folder || !canWriteVirtualFolderInfoToTopicYaml(nodeId)) {
    return { failed: 1, unchanged: 0, updated: 0 };
  }
  const topicIds = buildVirtualNodeResultIndex(initial).resultIdsByVirtualId.get(nodeId) ?? [];
  const result = { failed: 0, unchanged: 0, updated: 0 };
  for (const topicId of topicIds) {
    try {
      const document = await ensureWorkspaceNodeDocumentReady(topicId, { forceLoad: true, keepWarm: true });
      if (!document) {
        result.failed += 1;
        continue;
      }
      const content = addTopicCollection(document.content, folder.title);
      if (content === document.content) {
        result.unchanged += 1;
        continue;
      }
      const saved = await useWorkspaceStore.getState().updateNodeContent(topicId, content);
      const persisted = saved && await drainPendingNodeContentRuntimePersist(topicId);
      result[persisted ? 'updated' : 'failed'] += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

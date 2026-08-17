import { replaceUniqueArticleTitleHeading } from '../features/nodes/model/articleTitleHeading';

import { getWorkspaceMutationRepository } from './workspaceMutationRepository';
import { createWorkspaceNodeMutationPatch } from './workspaceNodeMutationPatch';
import type { WorkspaceState } from './workspaceStore';
import type { WorkspaceStructureRenameEntry } from './workspaceStructureHistoryTypes';

export async function applyWorkspaceStructureRenameHistory(
  get: () => WorkspaceState,
  entry: WorkspaceStructureRenameEntry,
  mode: 'redo' | 'undo'
) {
  const sourceTitle = mode === 'undo' ? entry.afterTitle : entry.beforeTitle;
  const targetTitle = mode === 'undo' ? entry.beforeTitle : entry.afterTitle;
  const current = get().nodesById[entry.nodeId];
  if (!current || current.title !== sourceTitle || current.kind !== entry.kind) return null;
  const content = current.kind === 'topic'
    ? replaceUniqueArticleTitleHeading(current.content, targetTitle) ?? current.content
    : current.content;
  const requested = {
    ...current,
    content,
    hasContent: content.trim().length > 0,
    hideTitleHeading: false,
    isTitleManual: true,
    title: targetTitle,
    updatedAt: new Date().toISOString()
  };
  const result = await getWorkspaceMutationRepository().syncNodeMutation(requested);
  const latest = get();
  if (!result?.updatedNodeIds?.includes(entry.nodeId) || latest.nodesById[entry.nodeId]?.title !== sourceTitle) {
    return null;
  }
  const targetResult = { ...result };
  delete targetResult.activeNodeId;
  delete targetResult.nodeOrder;
  const patch = createWorkspaceNodeMutationPatch(latest, targetResult);
  if (!patch.nodesById) return null;
  const acceptedNode = patch.nodesById[entry.nodeId];
  if (!acceptedNode) return null;
  return {
    nodesById: {
      ...patch.nodesById,
      [entry.nodeId]: {
        ...acceptedNode,
        content,
        hasContent: content.trim().length > 0
      }
    }
  };
}

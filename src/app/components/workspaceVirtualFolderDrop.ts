import { useState, type DragEvent as ReactDragEvent } from 'react';

import {
  clearNodeListDragSource,
  isInvalidNodeListDropTarget,
  readNodeListDragSource,
  writeNodeListDragSource
} from '../../features/nodes/components/NodeListDragSource';
import { isVirtualNode, isVirtualRootNode } from '../../features/nodes/model/specialNodes';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { appendMissingTopicIds, isManualVirtualFolder } from './workspaceVirtualFolderMembership';

function readDraggedNodeIds(event: ReactDragEvent<HTMLElement>) {
  const state = useWorkspaceStore.getState();
  const trashedIds = new Set(state.trashedNodeIds);
  return readNodeListDragSource(event, []).filter((nodeId) => state.nodesById[nodeId] && !trashedIds.has(nodeId));
}

function resolveVirtualFolderDrop(folderId: string, event: ReactDragEvent<HTMLElement>) {
  const state = useWorkspaceStore.getState();
  const sourceIds = readDraggedNodeIds(event);
  const folder = state.nodesById[folderId];
  const virtualFolderIds = sourceIds.filter((nodeId) => isVirtualNode(state.nodesById[nodeId]));
  if (
    virtualFolderIds.length === sourceIds.length &&
    virtualFolderIds.length > 0 &&
    (isVirtualRootNode(folder) || isVirtualNode(folder)) &&
    !isInvalidNodeListDropTarget(folderId, virtualFolderIds, state.nodesById)
  ) {
    return { effect: 'move' as const, sourceIds: virtualFolderIds };
  }
  const topicIds = sourceIds.filter((nodeId) => state.nodesById[nodeId]?.kind === 'topic');
  return topicIds.length === sourceIds.length && topicIds.length > 0 && isManualVirtualFolder(folder)
    ? { effect: 'copy' as const, sourceIds: topicIds }
    : null;
}

export function useWorkspaceVirtualFolderDrop() {
  const [targetId, setTargetId] = useState<string | null>(null);
  const onDragOver = (folderId: string, event: ReactDragEvent<HTMLElement>) => {
    const drop = resolveVirtualFolderDrop(folderId, event);
    if (!drop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = drop.effect;
    setTargetId(folderId);
  };
  const onDragLeave = (folderId: string, event: ReactDragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) return;
    setTargetId((current) => current === folderId ? null : current);
  };
  const onDrop = (folderId: string, event: ReactDragEvent<HTMLElement>) => {
    const state = useWorkspaceStore.getState();
    const drop = resolveVirtualFolderDrop(folderId, event);
    if (!drop) return;
    event.preventDefault();
    const folder = state.nodesById[folderId];
    if (drop.effect === 'move') {
      void state.moveNodes(drop.sourceIds, folderId, 'child');
    } else if (isManualVirtualFolder(folder)) {
      state.setFolderManualChildOrder?.(
        folderId,
        appendMissingTopicIds(folder.manualChildOrder ?? [], drop.sourceIds)
      );
    }
    clearNodeListDragSource();
    setTargetId(null);
  };
  return {
    onDragEnd: clearNodeListDragSource,
    onDragEnter: onDragOver,
    onDragLeave,
    onDragOver,
    onDragStart: (folderId: string, event: ReactDragEvent<HTMLElement>) => writeNodeListDragSource(event, [folderId]),
    onDrop,
    targetId
  };
}

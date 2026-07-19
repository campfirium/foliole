import { useState, type DragEvent as ReactDragEvent } from 'react';

import {
  clearNodeListDragSource,
  readNodeListDragSource
} from '../../features/nodes/components/NodeListDragSource';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { appendMissingTopicIds, isManualVirtualFolder } from './workspaceVirtualFolderMembership';

function readDraggedTopicIds(event: ReactDragEvent<HTMLElement>) {
  const state = useWorkspaceStore.getState();
  const trashedIds = new Set(state.trashedNodeIds);
  return readNodeListDragSource(event, []).filter((nodeId) => {
    const node = state.nodesById[nodeId];
    return node?.kind === 'topic' && !trashedIds.has(nodeId);
  });
}

export function useWorkspaceVirtualFolderDrop() {
  const [targetId, setTargetId] = useState<string | null>(null);
  const onDragOver = (folderId: string, event: ReactDragEvent<HTMLElement>) => {
    const folder = useWorkspaceStore.getState().nodesById[folderId];
    if (!isManualVirtualFolder(folder) || readDraggedTopicIds(event).length === 0) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setTargetId(folderId);
  };
  const onDragLeave = (folderId: string, event: ReactDragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) return;
    setTargetId((current) => current === folderId ? null : current);
  };
  const onDrop = (folderId: string, event: ReactDragEvent<HTMLElement>) => {
    const state = useWorkspaceStore.getState();
    const folder = state.nodesById[folderId];
    const topicIds = readDraggedTopicIds(event);
    if (!isManualVirtualFolder(folder) || topicIds.length === 0) return;
    event.preventDefault();
    state.setFolderManualChildOrder?.(
      folderId,
      appendMissingTopicIds(folder.manualChildOrder ?? [], topicIds)
    );
    clearNodeListDragSource();
    setTargetId(null);
  };
  return { onDragLeave, onDragOver, onDrop, targetId };
}

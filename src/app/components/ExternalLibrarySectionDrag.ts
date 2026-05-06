import { useMemo, useRef, useState, type DragEvent as ReactDragEvent } from 'react';

import type { ExternalLibraryFolder } from '../../shared/platform/externalLibraryBrowseRepository';
import {
  createExternalLibraryFolderOrder,
  moveExternalLibraryFolder,
  saveExternalLibraryFolderOrder,
  type ExternalLibraryFolderOrderItem
} from '../../shared/platform/externalLibraryFolderOrder';

type ExternalFolderDragState = {
  dropIntent: 'after' | 'before';
  sourceId: string;
  targetId: string | null;
};

export function useExternalFolderDrag(
  orderedFolders: ExternalLibraryFolder[],
  setFolderOrder: React.Dispatch<React.SetStateAction<ExternalLibraryFolderOrderItem[]>>
) {
  const [state, setState] = useState<ExternalFolderDragState | null>(null);
  const stateRef = useRef<ExternalFolderDragState | null>(null);
  const folderIds = useMemo(() => new Set(orderedFolders.map((folder) => folder.id)), [orderedFolders]);
  const onDragStart = (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => {
    if (!folderIds.has(nodeId)) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', nodeId);
    const nextState = { dropIntent: 'after' as const, sourceId: nodeId, targetId: null };
    stateRef.current = nextState;
    setState(nextState);
  };
  const onDragOver = (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => {
    const current = stateRef.current;
    if (!current || !folderIds.has(nodeId) || nodeId === current.sourceId) return;
    event.preventDefault();
    const dropIntent = resolveExternalFolderDropIntent(event);
    const nextState = { ...current, dropIntent, targetId: nodeId };
    stateRef.current = nextState;
    setState(nextState);
  };
  const onDrop = (nodeId: string, event: ReactDragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const currentState = stateRef.current;
    if (!currentState || !folderIds.has(nodeId) || nodeId === currentState.sourceId) {
      stateRef.current = null;
      setState(null);
      return;
    }
    const dropIntent = currentState.targetId === nodeId
      ? currentState.dropIntent
      : resolveExternalFolderDropIntent(event);
    const nextFolders = moveExternalLibraryFolder(orderedFolders, currentState.sourceId, nodeId, dropIntent);
    saveExternalLibraryFolderOrder(nextFolders);
    setFolderOrder(createExternalLibraryFolderOrder(nextFolders));
    stateRef.current = null;
    setState(null);
  };
  return {
    onDragEnd: () => {
      stateRef.current = null;
      setState(null);
    },
    onDragOver,
    onDragStart,
    onDrop,
    state
  };
}

function resolveExternalFolderDropIntent(event: ReactDragEvent<HTMLDivElement>): ExternalFolderDragState['dropIntent'] {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

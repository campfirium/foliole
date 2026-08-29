import { useEffect, useMemo, useState } from 'react';

interface UseTrashViewParams {
  clearActiveNode?: () => void;
  trashedNodeIds: string[];
}

export function useTrashView({ clearActiveNode, trashedNodeIds }: UseTrashViewParams) {
  const [isTrashViewOpen, setIsTrashViewOpen] = useState(false);
  const [selectedTrashNodeId, setSelectedTrashNodeId] = useState<string | null>(null);

  const trashedNodeIdSet = useMemo(() => new Set(trashedNodeIds), [trashedNodeIds]);

  useEffect(() => {
    if (!isTrashViewOpen) {
      setSelectedTrashNodeId(null);
      return;
    }
    if (selectedTrashNodeId && !trashedNodeIdSet.has(selectedTrashNodeId)) {
      setSelectedTrashNodeId(null);
    }
  }, [isTrashViewOpen, selectedTrashNodeId, trashedNodeIdSet]);

  const openTrashView = () => {
    clearActiveNode?.();
    setIsTrashViewOpen(true);
  };

  const closeTrashView = () => {
    setIsTrashViewOpen(false);
  };

  return {
    closeTrashView,
    isTrashViewOpen,
    openTrashView,
    selectedTrashNodeId,
    setSelectedTrashNodeId
  };
}

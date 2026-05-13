import { useEffect, useMemo, useState } from 'react';

interface UseTrashViewParams {
  nodeOrder: string[];
  trashedNodeIds: string[];
}

export function useTrashView({ nodeOrder, trashedNodeIds }: UseTrashViewParams) {
  const [isTrashViewOpen, setIsTrashViewOpen] = useState(false);
  const [selectedTrashNodeId, setSelectedTrashNodeId] = useState<string | null>(null);

  const trashedNodeOrder = useMemo(
    () => nodeOrder.filter((nodeId) => trashedNodeIds.includes(nodeId)),
    [nodeOrder, trashedNodeIds]
  );

  useEffect(() => {
    if (!isTrashViewOpen) {
      setSelectedTrashNodeId(null);
      return;
    }
    if (trashedNodeOrder.length === 0) {
      setSelectedTrashNodeId(null);
      return;
    }
    if (!selectedTrashNodeId || !trashedNodeIds.includes(selectedTrashNodeId)) {
      setSelectedTrashNodeId(trashedNodeOrder[0] ?? null);
    }
  }, [isTrashViewOpen, selectedTrashNodeId, trashedNodeIds, trashedNodeOrder]);

  const openTrashView = () => {
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

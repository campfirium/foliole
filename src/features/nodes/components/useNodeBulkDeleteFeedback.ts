import { useState } from 'react';

function createDeleteRunner(
  setDeleteStatusLabel: (label: string | null) => void,
  runDelete: (targetNodeIds: string[]) => void,
  formatLabel: (targetCount: number) => string
) {
  return (nodeIds: string[]) => {
    if (nodeIds.length <= 1) {
      runDelete(nodeIds);
      return;
    }
    setDeleteStatusLabel(formatLabel(nodeIds.length));
    window.setTimeout(() => {
      try {
        runDelete(nodeIds);
      } finally {
        setDeleteStatusLabel(null);
      }
    }, 0);
  };
}

export function useNodeBulkDeleteFeedback(
  deleteNodes: (nodeIds: string[]) => void,
  deleteNodesPermanently: (nodeIds: string[]) => void
) {
  const [deleteStatusLabel, setDeleteStatusLabel] = useState<string | null>(null);

  return {
    deleteStatusLabel,
    runDeleteNodes: createDeleteRunner(setDeleteStatusLabel, deleteNodes, (targetCount) => `Deleting ${targetCount} nodes…`),
    runDeleteNodesPermanently: createDeleteRunner(
      setDeleteStatusLabel,
      deleteNodesPermanently,
      (targetCount) => `Deleting ${targetCount} nodes permanently…`
    )
  };
}

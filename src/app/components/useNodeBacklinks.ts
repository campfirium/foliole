import { useEffect, useMemo, useState } from 'react';

import { collectBacklinks, type BacklinkItem } from '../../features/nodes/model/internalLinks';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { loadRuntimeNodeBacklinks } from '../../shared/platform/nodeBacklinksBridge';

function collectLocalBacklinks(args: {
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  targetNodeId: string | null;
  trashedNodeIds: string[];
}) {
  if (!args.targetNodeId) {
    return [];
  }
  return collectBacklinks({
    targetNodeId: args.targetNodeId,
    nodeOrder: args.nodeOrder,
    nodesById: args.nodesById,
    trashedNodeIds: args.trashedNodeIds
  });
}

export function useNodeBacklinks(args: {
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  targetNodeId: string | null;
  trashedNodeIds: string[];
}) {
  const localBacklinks = useMemo(
    () => collectLocalBacklinks(args),
    [args]
  );
  const [runtimeBacklinks, setRuntimeBacklinks] = useState<BacklinkItem[] | null>(null);

  useEffect(() => {
    if (!args.targetNodeId) {
      setRuntimeBacklinks(null);
      return;
    }

    let cancelled = false;
    void loadRuntimeNodeBacklinks(args.targetNodeId).then((backlinks) => {
      if (!cancelled) {
        setRuntimeBacklinks(backlinks);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [args.targetNodeId, args.nodeOrder, args.nodesById, args.trashedNodeIds]);

  return runtimeBacklinks ?? localBacklinks;
}

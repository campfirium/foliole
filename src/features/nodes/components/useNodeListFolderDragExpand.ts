import { useEffect, useEffectEvent } from 'react';

import type { NodeTreeRow } from '../model/nodeTree';
import { isHomeNode } from '../model/specialNodes';

import type { NodeListDragController } from './NodeListTreeDrag';

export function useNodeListFolderDragExpand(args: {
  collapsedNodeIds: ReadonlySet<string>;
  drag: NodeListDragController;
  onExpandCollapse: (nodeId: string) => void;
  rows: NodeTreeRow[];
}) {
  const targetNodeId = args.drag.dropIntent === 'child' ? args.drag.dropTargetNodeId : null;
  const targetRow = args.rows.find(row => row.node.id === targetNodeId);
  const canExpand = Boolean(targetRow && !isHomeNode(targetRow.node) && targetRow.hasChildren &&
    targetRow.node.kind === 'folder' && args.collapsedNodeIds.has(targetRow.node.id));
  const expand = useEffectEvent(() => {
    if (canExpand && targetNodeId) args.onExpandCollapse(targetNodeId);
  });

  useEffect(() => {
    if (!canExpand || !targetNodeId) return;
    const timer = window.setTimeout(expand, 500);
    return () => window.clearTimeout(timer);
  }, [canExpand, targetNodeId]);
}

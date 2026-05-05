import { useMemo, useState } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { buildNodeTree, buildVisibleNodeTreeRows } from '../../features/nodes/model/nodeTree';
import {
  VIRTUAL_ROOT_NODE_ID,
  isVirtualNode,
  isVirtualRootNode
} from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

import { compareNaturalName } from './workspaceContentSort';

interface WorkspaceVirtualSectionProps {
  activeVirtualNodeId?: string | null;
  isVirtualViewOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onOpenVirtualView?: (nodeId?: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
}

function toggleCollapsed(nodeId: string, setCollapsedIds: React.Dispatch<React.SetStateAction<Set<string>>>) {
  setCollapsedIds((current) => {
    const next = new Set(current);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    return next;
  });
}

export function WorkspaceVirtualSection(props: WorkspaceVirtualSectionProps) {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const rowSpacing = getNodeListRowSpacing();
  const rows = useMemo(() => {
    const virtualNodeIds = props.nodeOrder.filter((nodeId) => {
      const node = props.nodesById[nodeId];
      return isVirtualRootNode(node) || isVirtualNode(node);
    }).sort((leftId, rightId) => compareVirtualNodeTitle(leftId, rightId, props.nodesById));
    return buildVisibleNodeTreeRows(buildNodeTree(virtualNodeIds, props.nodesById).rows, collapsedIds);
  }, [collapsedIds, props.nodeOrder, props.nodesById]);
  const onRowKeyDown = useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds: collapsedIds,
        onSelect: (nodeId) => {
          props.onOpenVirtualView?.(nodeId);
          props.onSelectNodeInVirtualView(nodeId);
        },
        onToggleCollapse: (nodeId) => toggleCollapsed(nodeId, setCollapsedIds),
        rows
      }),
    [collapsedIds, props, rows]
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 flex min-w-0 flex-col">
      <div aria-hidden="true" className="mx-4 border-t border-border/15" />
      <section aria-label="Virtual folder tree" className="flex flex-col pt-1" role="tree">
        {rows.map((row) => {
          const isSelected = props.isVirtualViewOpen && (props.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID) === row.node.id;
          return (
            <NodeTreeRow
              depth={row.depth}
              hasChildren={row.hasChildren}
              isActive={isSelected}
              isCollapsed={collapsedIds.has(row.node.id)}
              isSelected={isSelected}
              key={row.node.id}
              label={row.node.title}
              nodeId={row.node.id}
              rowSpacing={rowSpacing}
              showIcon={false}
              onKeyDown={onRowKeyDown}
              onSelect={(nodeId) => {
                props.onOpenVirtualView?.(nodeId);
                props.onSelectNodeInVirtualView(nodeId);
              }}
              onToggleCollapse={(nodeId) => toggleCollapsed(nodeId, setCollapsedIds)}
            />
          );
        })}
      </section>
    </div>
  );
}

function compareVirtualNodeTitle(
  leftId: string,
  rightId: string,
  nodesById: WorkspaceListNodesById
) {
  if (leftId === VIRTUAL_ROOT_NODE_ID) return -1;
  if (rightId === VIRTUAL_ROOT_NODE_ID) return 1;
  return compareNaturalName(nodesById[leftId]?.title ?? '', nodesById[rightId]?.title ?? '');
}

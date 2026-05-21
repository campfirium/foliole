import { useMemo, useState } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { NodeTreeRow } from '../../features/nodes/components/NodeTreeRow';
import { buildNodeTree, buildVisibleNodeTreeRows } from '../../features/nodes/model/nodeTree';
import {
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_REMOVED_NODE_ID,
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
  virtualResultCountById?: ReadonlyMap<string, number> | undefined;
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

function renderRemovedRow(
  props: Pick<WorkspaceVirtualSectionProps, 'activeVirtualNodeId' | 'isVirtualViewOpen' | 'onOpenVirtualView'> & {
    onRowKeyDown: ReturnType<typeof createNodeListRowKeydownHandler>;
    rowSpacing: number;
  }
) {
  return (
    <NodeTreeRow
      depth={1}
      hasChildren={false}
      isActive={props.isVirtualViewOpen && props.activeVirtualNodeId === VIRTUAL_REMOVED_NODE_ID}
      isCollapsed={false}
      isSelected={props.isVirtualViewOpen && props.activeVirtualNodeId === VIRTUAL_REMOVED_NODE_ID}
      key={VIRTUAL_REMOVED_NODE_ID}
      label="Removed"
      nodeId={VIRTUAL_REMOVED_NODE_ID}
      rowSpacing={props.rowSpacing}
      showIcon={false}
      onKeyDown={props.onRowKeyDown}
      onSelect={() => props.onOpenVirtualView?.(VIRTUAL_REMOVED_NODE_ID)}
      onToggleCollapse={() => undefined}
    />
  );
}

function renderVirtualRows(args: {
  collapsedIds: Set<string>;
  onRowKeyDown: ReturnType<typeof createNodeListRowKeydownHandler>;
  props: WorkspaceVirtualSectionProps;
  rowSpacing: number;
  rows: ReturnType<typeof buildVisibleNodeTreeRows>;
  setCollapsedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
}) {
  return args.rows.flatMap((row) => {
    const isSelected = args.props.isVirtualViewOpen && (args.props.activeVirtualNodeId ?? VIRTUAL_ROOT_NODE_ID) === row.node.id;
    const isVirtualRoot = row.node.id === VIRTUAL_ROOT_NODE_ID;
    const isVirtualRootCollapsed = args.collapsedIds.has(VIRTUAL_ROOT_NODE_ID);
    const virtualRow = (
      <NodeTreeRow
        depth={row.depth}
        hasChildren={isVirtualRoot ? true : row.hasChildren}
        isActive={isSelected}
        isCollapsed={args.collapsedIds.has(row.node.id)}
        isSelected={isSelected}
        key={row.node.id}
        label={row.node.title}
        nodeId={row.node.id}
        descendantCount={args.props.virtualResultCountById?.get(row.node.id) ?? 0}
        rowSpacing={args.rowSpacing}
        showIcon={false}
        onKeyDown={args.onRowKeyDown}
        onSelect={(nodeId) => {
          args.props.onOpenVirtualView?.(nodeId);
          args.props.onSelectNodeInVirtualView(nodeId);
        }}
        onToggleCollapse={(nodeId) => toggleCollapsed(nodeId, args.setCollapsedIds)}
      />
    );
    return isVirtualRoot && !isVirtualRootCollapsed
      ? [virtualRow, renderRemovedRow({ ...args.props, onRowKeyDown: args.onRowKeyDown, rowSpacing: args.rowSpacing })]
      : [virtualRow];
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
  const keyboardRows = useMemo(
    () =>
      rows.flatMap((row) =>
        row.node.id === VIRTUAL_ROOT_NODE_ID && !collapsedIds.has(VIRTUAL_ROOT_NODE_ID)
          ? [{ ...row, hasChildren: true }, { depth: 1, hasChildren: false, id: VIRTUAL_REMOVED_NODE_ID }]
          : row.node.id === VIRTUAL_ROOT_NODE_ID
            ? [{ ...row, hasChildren: true }]
          : [row]
      ),
    [collapsedIds, rows]
  );
  const onRowKeyDown = useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds: collapsedIds,
        onSelect: (nodeId) => {
          if (nodeId === VIRTUAL_REMOVED_NODE_ID) {
            props.onOpenVirtualView?.(VIRTUAL_REMOVED_NODE_ID);
            return;
          }
          props.onOpenVirtualView?.(nodeId);
          props.onSelectNodeInVirtualView(nodeId);
        },
        onToggleCollapse: (nodeId) => toggleCollapsed(nodeId, setCollapsedIds),
        rows: keyboardRows
      }),
    [collapsedIds, keyboardRows, props]
  );

  if (rows.length === 0) {
    return null;
  }

  return (
    <div className="mt-1 flex min-w-0 flex-col">
      <div aria-hidden="true" className="mx-4 border-t border-border/15" />
      <section aria-label="Virtual folder tree" className="flex flex-col pt-1" role="tree">
        {renderVirtualRows({ collapsedIds, onRowKeyDown, props, rowSpacing, rows, setCollapsedIds })}
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

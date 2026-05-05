import type { ReactNode } from 'react';

import { NodeBreadcrumbs } from '../../features/nodes/components/NodeBreadcrumbs';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { toWorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';

interface DocumentPanelHeaderCenterProps {
  activeNodeId: string | null;
  isFolderListView: boolean;
  nodesById: Record<string, Node>;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  rightSlot?: ReactNode;
}

export function DocumentPanelHeaderCenter({
  activeNodeId,
  isFolderListView,
  nodesById,
  onSelectBreadcrumbNode,
  rightSlot
}: DocumentPanelHeaderCenterProps) {
  if (isFolderListView) {
    return <div aria-hidden="true" className="min-h-9 flex-1 border-b border-border/60" />;
  }

  return (
    <div className="min-w-0">
      <div className="mx-auto grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 max-w-[var(--document-max-width)]">
        <NodeBreadcrumbs
          activeNodeId={activeNodeId}
          nodesById={toWorkspaceListNodesById(nodesById)}
          onSelectNode={onSelectBreadcrumbNode}
        />
        {rightSlot ? <div className="flex shrink-0 items-center justify-end gap-1">{rightSlot}</div> : null}
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { useMemo, useRef } from 'react';

import { NodeBreadcrumbs } from '../../features/nodes/components/NodeBreadcrumbs';
import type { Node } from '../../features/nodes/model/nodeTypes';
import {
  projectWorkspaceListNodesById,
  type WorkspaceListNodesById
} from '../../features/nodes/model/workspaceListNode';

interface DocumentPanelHeaderCenterProps {
  activeNodeId: string | null;
  compactNavigationSlot?: ReactNode;
  isFolderListView: boolean;
  nodesById: Record<string, Node>;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  rightSlot?: ReactNode;
}

export function DocumentPanelHeaderCenter({
  activeNodeId,
  compactNavigationSlot,
  isFolderListView,
  nodesById,
  onSelectBreadcrumbNode,
  rightSlot
}: DocumentPanelHeaderCenterProps) {
  const previousListNodesByIdRef = useRef<WorkspaceListNodesById>({});
  const listNodesById = useMemo(() => {
    const nextProjection = projectWorkspaceListNodesById(
      nodesById,
      previousListNodesByIdRef.current
    );
    previousListNodesByIdRef.current = nextProjection;
    return nextProjection;
  }, [nodesById]);

  if (isFolderListView) {
    return <div aria-hidden="true" className="min-h-9 flex-1 border-b border-border/60" />;
  }

  return (
    <div className="[container-type:inline-size] min-w-0 flex-1">
      <div
        className="mx-auto grid w-full max-w-[var(--document-max-width)] grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-[var(--document-content-inline-padding)] [@container(max-width:1040px)]:grid-cols-[auto_minmax(0,1fr)_auto]"
        data-testid="document-header-content-rail"
      >
        {compactNavigationSlot ? (
          <div className="hidden shrink-0 items-center [@container(max-width:1040px)]:flex">
            {compactNavigationSlot}
          </div>
        ) : null}
        <NodeBreadcrumbs
          activeNodeId={activeNodeId}
          nodesById={listNodesById}
          onSelectNode={onSelectBreadcrumbNode}
        />
        {rightSlot ? <div className="flex shrink-0 items-center justify-end gap-1">{rightSlot}</div> : null}
      </div>
    </div>
  );
}

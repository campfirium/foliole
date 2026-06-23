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
  editorActionsSlot?: ReactNode;
  isFolderListView: boolean;
  navigationSlot?: ReactNode;
  nodesById: Record<string, Node>;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  rightSlot?: ReactNode;
}

export function DocumentPanelHeaderCenter({
  activeNodeId,
  editorActionsSlot,
  isFolderListView,
  navigationSlot,
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
        className="mx-auto grid w-full max-w-[var(--document-max-width)] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-[var(--document-content-inline-padding)]"
        data-testid="document-header-content-rail"
      >
        {navigationSlot ? (
          <div className="flex shrink-0 items-center" data-testid="document-header-compact-navigation-aligner">
            {navigationSlot}
          </div>
        ) : null}
        <div className="min-w-0" data-testid="document-header-breadcrumb-aligner">
          <NodeBreadcrumbs
            activeNodeId={activeNodeId}
            nodesById={listNodesById}
            onSelectNode={onSelectBreadcrumbNode}
          />
        </div>
        {rightSlot || editorActionsSlot ? (
          <div className="flex shrink-0 items-center justify-end gap-1">
            {rightSlot}
            {editorActionsSlot}
          </div>
        ) : null}
      </div>
    </div>
  );
}

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
  folderItemCountLabel?: string | null;
  isFolderListView: boolean;
  nodesById: Record<string, Node>;
  onSelectBreadcrumbNode: (nodeId: string) => void;
  rightSlot?: ReactNode;
}

export function DocumentPanelHeaderCenter({
  activeNodeId,
  folderItemCountLabel,
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
    const activeNode = activeNodeId ? nodesById[activeNodeId] : null;
    const folderTitle = activeNode?.title?.trim() || 'Folder';
    return (
      <div className="min-w-0">
        <div className="mx-auto flex w-full max-w-[var(--document-max-width)] items-baseline gap-2">
          <h2 className="truncate text-base font-semibold text-foreground" title={folderTitle}>
            {folderTitle}
          </h2>
          {folderItemCountLabel ? (
            <p
              aria-label={`Folder result count ${folderItemCountLabel}`}
              className="shrink-0 text-sm font-medium text-foreground/58"
              data-testid="folder-list-count"
            >
              {folderItemCountLabel}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <div className="mx-auto grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 max-w-[var(--document-max-width)]">
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

import { useState } from 'react';

import { buildNodeBreadcrumbs } from '../model/nodeBreadcrumbs';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { AppBreadcrumb } from '@/shared/ui';

interface NodeBreadcrumbsProps {
  activeNodeId: string | null;
  nodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
}

export function NodeBreadcrumbs({ activeNodeId, nodesById, onSelectNode }: NodeBreadcrumbsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const sourceItems = buildNodeBreadcrumbs(activeNodeId, nodesById, isExpanded ? Number.MAX_SAFE_INTEGER : 3);
  const items = sourceItems.map((item, index) => ({
    id: item.id,
    isCurrent: index === sourceItems.length - 1,
    isEllipsis: item.isEllipsis,
    label: item.title
  }));

  if (items.length === 0) {
    return null;
  }

  return (
    <AppBreadcrumb
      ariaLabel="Node breadcrumbs"
      items={items}
      onExpandEllipsis={() => setIsExpanded(true)}
      onSelect={onSelectNode}
    />
  );
}

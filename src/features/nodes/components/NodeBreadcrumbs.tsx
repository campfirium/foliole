import type { WorkspaceListNodesById } from '../model/workspaceListNode';
import { buildBreadcrumbDisplayPath } from '../../../shared/lib/breadcrumbDisplayPath';

import { AppBreadcrumb } from '@/shared/ui';

interface NodeBreadcrumbsProps {
  activeNodeId: string | null;
  nodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
}

export function NodeBreadcrumbs({ activeNodeId, nodesById, onSelectNode }: NodeBreadcrumbsProps) {
  const sourceItems = buildBreadcrumbDisplayPath(activeNodeId, nodesById);
  const items = sourceItems.map((item) => ({
    id: item.id,
    label: item.title
  }));

  if (items.length === 0) {
    return null;
  }

  return (
    <AppBreadcrumb
      ariaLabel="Node breadcrumbs"
      items={items}
      onSelect={onSelectNode}
    />
  );
}

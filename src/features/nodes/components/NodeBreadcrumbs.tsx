import { useState } from 'react';

import { buildNodeBreadcrumbs } from '../model/nodeBreadcrumbs';
import { getNodeKindLabel } from '../model/nodeKindLabel';
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
    label: item.isEllipsis ? item.title : <BreadcrumbLabel kind={item.kind} title={item.title} />
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

function BreadcrumbLabel({ kind, title }: { kind?: 'folder' | 'topic' | 'item'; title: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 align-baseline">
      {kind ? (
        <span aria-hidden="true" className="text-[11px] text-[#a4aab1]">
          {getNodeKindLabel(kind)}
        </span>
      ) : null}
      <span className="min-w-0 truncate">{title}</span>
    </span>
  );
}

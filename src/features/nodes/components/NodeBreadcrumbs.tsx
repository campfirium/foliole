import { useState } from 'react';

import { buildNodeBreadcrumbs } from '../model/nodeBreadcrumbs';
import type { Node } from '../model/nodeTypes';

interface NodeBreadcrumbsProps {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}

export function NodeBreadcrumbs({ activeNodeId, nodesById, onSelectNode }: NodeBreadcrumbsProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const items = buildNodeBreadcrumbs(activeNodeId, nodesById, isExpanded ? Number.MAX_SAFE_INTEGER : 3);
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Node breadcrumbs" className="node-breadcrumbs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        if (item.isEllipsis) {
          return (
            <button
              aria-label="Expand breadcrumb path"
              className="node-breadcrumbs-segment node-breadcrumbs-button node-breadcrumbs-ellipsis"
              key={item.id}
              onClick={() => setIsExpanded(true)}
              type="button"
            >
              {item.title}
            </button>
          );
        }

        return (
          <span className="node-breadcrumbs-item" key={item.id}>
            <button
              aria-current={isLast ? 'page' : undefined}
              className="node-breadcrumbs-segment node-breadcrumbs-button"
              onClick={() => onSelectNode(item.id)}
              type="button"
            >
              {item.title}
            </button>
            {!isLast ? (
              <span aria-hidden="true" className="node-breadcrumbs-separator">
                {' / '}
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}

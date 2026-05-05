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
    <nav aria-label="Node breadcrumbs" className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        if (item.isEllipsis) {
          return (
            <button
              aria-label="Expand breadcrumb path"
              className="inline-block max-w-none border-0 bg-transparent p-0 text-xs font-medium leading-none text-slate-500"
              key={item.id}
              onClick={() => setIsExpanded(true)}
              type="button"
            >
              {item.title}
            </button>
          );
        }

        return (
          <span className="inline" key={item.id}>
            <button
              aria-current={isLast ? 'page' : undefined}
              className="inline-block max-w-[18ch] overflow-hidden border-0 bg-transparent p-0 text-left align-bottom text-xs font-medium leading-none text-slate-500 text-ellipsis hover:text-foreground aria-[current=page]:max-w-[24ch] aria-[current=page]:cursor-default aria-[current=page]:text-foreground"
              onClick={() => onSelectNode(item.id)}
              type="button"
            >
              {item.title}
            </button>
            {!isLast ? (
              <span aria-hidden="true" className="px-1 text-xs font-medium leading-none text-slate-500">
                {' / '}
              </span>
            ) : null}
          </span>
        );
      })}
    </nav>
  );
}

import { buildNodeBreadcrumbs } from '../model/nodeBreadcrumbs';
import type { Node } from '../model/nodeTypes';

interface NodeBreadcrumbsProps {
  activeNodeId: string | null;
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}

export function NodeBreadcrumbs({ activeNodeId, nodesById, onSelectNode }: NodeBreadcrumbsProps) {
  const items = buildNodeBreadcrumbs(activeNodeId, nodesById);
  if (items.length <= 1) {
    return null;
  }

  return (
    <nav aria-label="Node breadcrumbs" className="node-breadcrumbs">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;

        if (item.isEllipsis) {
          return (
            <span aria-hidden="true" className="node-breadcrumbs-segment node-breadcrumbs-ellipsis" key={item.id}>
              {item.title}
            </span>
          );
        }

        return (
          <button
            aria-current={isLast ? 'page' : undefined}
            className="node-breadcrumbs-segment node-breadcrumbs-button"
            key={item.id}
            onClick={() => onSelectNode(item.id)}
            type="button"
          >
            {item.title}
          </button>
        );
      })}
    </nav>
  );
}

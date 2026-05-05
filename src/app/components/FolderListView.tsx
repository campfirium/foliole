import { getNodeKindLabel } from '../../features/nodes/model/nodeKindLabel';
import type { Node } from '../../features/nodes/model/nodeTypes';

interface FolderListViewProps {
  folderNodeId: string;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onSelectNode: (nodeId: string) => void;
}

function getDirectChildNodes(folderNodeId: string, nodeOrder: string[], nodesById: Record<string, Node>) {
  return nodeOrder
    .map((nodeId) => nodesById[nodeId])
    .filter((node): node is Node => Boolean(node && node.parentNodeId === folderNodeId));
}

function formatItemCount(count: number) {
  return `${count} ${count === 1 ? 'item' : 'items'}`;
}

export function FolderListView({ folderNodeId, nodeOrder, nodesById, onSelectNode }: FolderListViewProps) {
  const childNodes = getDirectChildNodes(folderNodeId, nodeOrder, nodesById);

  return (
    <div className="flex min-h-0 flex-1 px-4 pt-4 pb-4 max-[1080px]:px-2 max-[1080px]:pt-2">
      <section
        aria-label="Folder list view"
        className="mx-auto flex min-h-0 w-full max-w-[var(--document-max-width)] flex-1 flex-col overflow-hidden rounded-[var(--radius-3)] border border-border bg-bg-panel"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div aria-label="Folder list sorting" className="flex items-center gap-2 text-sm text-foreground/72">
            <span className="font-medium text-foreground">Sort</span>
            <span className="rounded-full border border-border bg-bg-elevated px-2.5 py-1 text-xs font-medium text-foreground/78">
              Manual order
            </span>
          </div>
          <p className="text-sm text-foreground/65">{formatItemCount(childNodes.length)}</p>
        </div>

        {childNodes.length === 0 ? (
          <div className="flex flex-1 items-center justify-center px-6 py-10">
            <div className="max-w-md text-center">
              <p className="text-base font-semibold text-foreground">This folder is empty</p>
              <p className="mt-2 text-sm leading-6 text-foreground/68">
                Direct children will appear here after you add notes, folders, or items to this folder.
              </p>
            </div>
          </div>
        ) : (
          <ul aria-label="Folder contents" className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 py-2">
            {childNodes.map((node) => (
              <li key={node.id}>
                <button
                  aria-label={`Open ${node.title}`}
                  className="flex w-full items-center justify-between gap-4 rounded-[var(--radius-2)] px-3 py-3 text-left transition-colors hover:bg-bg-elevated"
                  onClick={() => onSelectNode(node.id)}
                  type="button"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{node.title}</span>
                    <span className="mt-1 block text-xs text-foreground/62">Direct child</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-border bg-bg-elevated px-2.5 py-1 text-xs font-medium text-foreground/72">
                    {getNodeKindLabel(node.kind)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

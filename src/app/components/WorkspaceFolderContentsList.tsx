import { getNodeKindLabel } from '../../features/nodes/model/nodeKindLabel';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { AppButton, AppEmptyState } from '../../shared/ui';

interface WorkspaceFolderContentsListProps {
  activeFolderId: string | null;
  activeNodeId: string | null;
  itemIds: string[];
  nodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
}

export function WorkspaceFolderContentsList({
  activeFolderId,
  activeNodeId,
  itemIds,
  nodesById,
  onSelectNode
}: WorkspaceFolderContentsListProps) {
  const activeFolder = activeFolderId ? nodesById[activeFolderId] : undefined;

  return (
    <aside aria-label="Current folder contents" className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-panel text-foreground">
      <div className="app-scrollbar min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-bg-panel px-2 py-2">
        {itemIds.length === 0 ? (
          <div className="flex min-h-full items-center justify-center px-3 py-6">
            <AppEmptyState
              description="Select a folder with content, or add a note inside the current folder."
              title="No items in this folder"
            />
          </div>
        ) : (
          <div aria-label="Current folder item list" className="flex flex-col gap-1" role="tree">
            {itemIds.map((nodeId) => {
              const node = nodesById[nodeId];
              if (!node) {
                return null;
              }

              return (
                <AppButton
                  key={nodeId}
                  active={activeNodeId === nodeId}
                  aria-label={node.title}
                  aria-level={1}
                  aria-pressed={activeNodeId === nodeId}
                  aria-selected={activeNodeId === nodeId}
                  className="min-w-0 justify-start px-3 py-2 text-left"
                  data-node-id={nodeId}
                  onClick={() => onSelectNode(nodeId)}
                  role="treeitem"
                  variant="list"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">
                      {node.title || `${activeFolder?.title?.trim() || 'Folder'} ${getNodeKindLabel(node.kind ?? 'topic')}`}
                    </span>
                  </span>
                </AppButton>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

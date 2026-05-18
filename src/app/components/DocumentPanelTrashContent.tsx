import { ChevronDown, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { FolderListSortDirection, FolderListSortKey } from '../../features/nodes/model/folderListOrdering';
import type { Node } from '../../features/nodes/model/nodeTypes';
import { selectTrashRootIds } from '../../features/nodes/model/trashRootModel';
import {
  AppButton,
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuTrigger,
  AppIconButton
} from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { FolderListView } from './FolderListView';

const TRASH_EMPTY_STATE = {
  description: 'Deleted topics and folders will appear here.',
  title: 'This folder is empty'
} as const;

function collectTrashFolderNodes(args: {
  folderNodeId: string | null;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  if (!args.folderNodeId) {
    return selectTrashRootIds(args.nodeOrder, args.nodesById, args.trashedNodeIds)
      .map((nodeId) => args.nodesById[nodeId])
      .filter((node): node is Node => Boolean(node));
  }

  const trashedNodeIdSet = new Set(args.trashedNodeIds);
  return args.nodeOrder
    .map((nodeId) => args.nodesById[nodeId])
    .filter((node): node is Node => Boolean(node && node.parentNodeId === args.folderNodeId && trashedNodeIdSet.has(node.id)));
}

function formatTrashCount(count: number) {
  return `${count} ${count === 1 ? 'topic or folder' : 'topics and folders'}`;
}

function TrashCurrentViewActions({
  nodes,
  nodesById,
  trashedNodeIds
}: {
  nodes: Node[];
  nodesById: Record<string, Node>;
  trashedNodeIds: string[];
}) {
  const deleteNodesPermanently = useWorkspaceStore((state) => state.deleteNodesPermanently);
  const [deleteSnapshot, setDeleteSnapshot] = useState<Node[] | null>(null);

  return (
    <>
      <AppDropdownMenu>
        <AppDropdownMenuTrigger asChild>
          <AppIconButton
            className="size-6 text-foreground/54 hover:bg-foreground/[0.04] hover:text-foreground"
            icon={<ChevronDown size={15} strokeWidth={2} />}
            label="Current trash view actions"
          />
        </AppDropdownMenuTrigger>
        <AppDropdownMenuContent align="start" className="min-w-[204px]">
          <AppDropdownMenuLabel className="px-3 pb-1.5 pt-2">
            <span className="block text-xs font-medium text-foreground/72">Current view</span>
            <span className="block pt-0.5 text-xs font-normal tabular-nums text-foreground/52">
              {formatTrashCount(nodes.length)}
            </span>
          </AppDropdownMenuLabel>
          <AppDropdownMenuItem className="gap-2" disabled={nodes.length === 0} onSelect={() => setDeleteSnapshot(nodes)}>
            <Trash2 size={15} strokeWidth={1.8} />
            <span>Delete permanently...</span>
          </AppDropdownMenuItem>
        </AppDropdownMenuContent>
      </AppDropdownMenu>
      <TrashCurrentViewDeleteDialog
        deleteNodesPermanently={deleteNodesPermanently}
        deleteSnapshot={deleteSnapshot}
        nodesById={nodesById}
        onOpenChange={(open) => {
          if (!open) setDeleteSnapshot(null);
        }}
        trashedNodeIds={trashedNodeIds}
      />
    </>
  );
}

function TrashCurrentViewDeleteDialog({
  deleteNodesPermanently,
  deleteSnapshot,
  nodesById,
  onOpenChange,
  trashedNodeIds
}: {
  deleteNodesPermanently: (nodeIds: string[]) => void;
  deleteSnapshot: Node[] | null;
  nodesById: Record<string, Node>;
  onOpenChange: (open: boolean) => void;
  trashedNodeIds: string[];
}) {
  const nodeCount = deleteSnapshot?.length ?? 0;
  return (
    <AppDialog open={Boolean(deleteSnapshot)} onOpenChange={onOpenChange}>
      <AppDialogPortal>
        <AppDialogOverlay />
        <AppDialogContent className="w-[min(420px,calc(100vw-32px))] p-5">
          <AppDialogTitle>Delete permanently?</AppDialogTitle>
          <AppDialogDescription className="mt-2">
            {`This will permanently delete ${formatTrashCount(nodeCount)} from Trash.`}
          </AppDialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <AppDialogClose asChild>
              <AppButton variant="ghost">Cancel</AppButton>
            </AppDialogClose>
            <AppButton
              variant="primary"
              onClick={() => {
                if (deleteSnapshot) {
                  const trashedNodeIdSet = new Set(trashedNodeIds);
                  const nodeIds = deleteSnapshot
                    .map((node) => node.id)
                    .filter((nodeId) => nodesById[nodeId] && trashedNodeIdSet.has(nodeId));
                  deleteNodesPermanently(nodeIds);
                }
                onOpenChange(false);
              }}
            >
              Delete permanently
            </AppButton>
          </div>
        </AppDialogContent>
      </AppDialogPortal>
    </AppDialog>
  );
}

export function DocumentPanelTrashContent({
  folderListSortDirection,
  folderListSortKey,
  folderNodeId,
  folderTitle,
  nodeOrder,
  nodesById,
  onChangeFolderListSortDirection,
  onChangeFolderListSortKey,
  onSelectTrashNode,
  pdfCache,
  trashedNodeIds
}: {
  folderListSortDirection: FolderListSortDirection;
  folderListSortKey: FolderListSortKey;
  folderNodeId: string | null;
  folderTitle: string;
  nodeOrder: string[];
  nodesById: Record<string, Node>;
  onChangeFolderListSortDirection: (sortDirection: FolderListSortDirection) => void;
  onChangeFolderListSortKey: (sortKey: FolderListSortKey) => void;
  onSelectTrashNode: (nodeId: string) => void;
  pdfCache: JSX.Element;
  trashedNodeIds: string[];
}) {
  const listedNodes = collectTrashFolderNodes({ folderNodeId, nodeOrder, nodesById, trashedNodeIds });

  return (
    <>
      {pdfCache}
      <FolderListView
        currentViewActions={<TrashCurrentViewActions nodes={listedNodes} nodesById={nodesById} trashedNodeIds={trashedNodeIds} />}
        emptyState={TRASH_EMPTY_STATE}
        folderTitle={folderTitle}
        nodes={listedNodes}
        nodesById={nodesById}
        onChangeSortDirection={onChangeFolderListSortDirection}
        onChangeSortKey={onChangeFolderListSortKey}
        onSelectNode={onSelectTrashNode}
        regionLabel="Trash folder list"
        sortDirection={folderListSortDirection}
        sortKey={folderListSortKey}
      />
    </>
  );
}

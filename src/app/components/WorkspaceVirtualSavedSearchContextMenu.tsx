import { Pencil, Trash2 } from 'lucide-react';

import { NodeContextMenuItem, NodeContextMenuSeparator } from '../../features/nodes/components/nodeListContextMenuPresentation';
import { requestNodeRename } from '../../features/nodes/components/NodeTreeRowRename';
import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuTrigger } from '../../shared/ui';

interface WorkspaceVirtualSavedSearchContextMenuProps {
  left: number;
  nodeId: string;
  onClose: () => void;
  onDelete: (nodeId: string) => void;
  top: number;
}

export function WorkspaceVirtualSavedSearchContextMenu({
  left,
  nodeId,
  onClose,
  onDelete,
  top
}: WorkspaceVirtualSavedSearchContextMenuProps) {
  return (
    <AppDropdownMenu onOpenChange={(open) => (open ? undefined : onClose())} open>
      <AppDropdownMenuTrigger asChild>
        <button
          aria-hidden="true"
          className="pointer-events-none fixed h-0 w-0 opacity-0"
          style={{ left: `${left}px`, top: `${top}px` }}
          type="button"
        />
      </AppDropdownMenuTrigger>
      <AppDropdownMenuContent
        align="start"
        className="min-w-[224px] p-2"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onContextMenu={(event) => event.preventDefault()}
        sideOffset={0}
      >
        <NodeContextMenuItem
          icon={Pencil}
          onSelect={() => {
            requestNodeRename(nodeId);
            onClose();
          }}
        >
          Rename
        </NodeContextMenuItem>
        <NodeContextMenuSeparator />
        <NodeContextMenuItem
          icon={Trash2}
          onSelect={() => {
            onDelete(nodeId);
            onClose();
          }}
          tone="destructive"
        >
          Delete
        </NodeContextMenuItem>
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

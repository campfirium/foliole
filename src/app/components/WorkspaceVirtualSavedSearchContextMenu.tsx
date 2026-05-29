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
        className={[
          'min-w-[224px] rounded-lg border-[var(--app-floating-border-color)] p-2 shadow-popover',
          'bg-[color-mix(in_oklab,var(--app-floating-surface-bg)_82%,rgb(var(--color-background)))]',
          '[--node-context-menu-item-hover-bg:color-mix(in_oklab,var(--app-floating-item-hover-bg)_52%,rgb(var(--color-foreground)/0.12))]'
        ].join(' ')}
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

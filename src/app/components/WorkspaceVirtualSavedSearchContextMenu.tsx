import { FileCode2, FolderPlus, Pencil, Trash2 } from 'lucide-react';

import { NodeContextMenuItem, NodeContextMenuSeparator } from '../../features/nodes/components/nodeListContextMenuPresentation';
import { requestNodeRename } from '../../features/nodes/components/NodeTreeRowRename';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuTrigger } from '../../shared/ui';

interface WorkspaceVirtualSavedSearchContextMenuProps {
  left: number;
  nodeId: string;
  onClose: () => void;
  onCreateChild: (nodeId: string) => void;
  onDelete: (nodeId: string) => void;
  onWriteTopicYaml?: (nodeId: string) => void;
  top: number;
}

function WriteTopicYamlMenuItem(props: { nodeId: string; onClose: () => void; onWrite: (nodeId: string) => void }) {
  const t = useTranslation();
  return (
    <NodeContextMenuItem
      icon={FileCode2}
      onSelect={() => {
        props.onWrite(props.nodeId);
        props.onClose();
      }}
    >
      {t('desktop.workspace.virtualFolderYaml.write')}
    </NodeContextMenuItem>
  );
}

function CreateChildMenuItem(props: { nodeId: string; onClose: () => void; onCreate: (nodeId: string) => void }) {
  const t = useTranslation();
  return (
    <NodeContextMenuItem
      icon={FolderPlus}
      onSelect={() => {
        props.onCreate(props.nodeId);
        props.onClose();
      }}
    >
      {t('desktop.nodeList.createVirtualFolder')}
    </NodeContextMenuItem>
  );
}

export function WorkspaceVirtualSavedSearchContextMenu({
  left,
  nodeId,
  onClose,
  onCreateChild,
  onDelete,
  onWriteTopicYaml,
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
        <CreateChildMenuItem nodeId={nodeId} onClose={onClose} onCreate={onCreateChild} />
        <NodeContextMenuSeparator />
        <NodeContextMenuItem
          icon={Pencil}
          onSelect={() => {
            requestNodeRename(nodeId);
            onClose();
          }}
        >
          Rename
        </NodeContextMenuItem>
        {onWriteTopicYaml ? (
          <WriteTopicYamlMenuItem nodeId={nodeId} onClose={onClose} onWrite={onWriteTopicYaml} />
        ) : null}
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

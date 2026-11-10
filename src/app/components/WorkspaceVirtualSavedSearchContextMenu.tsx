import { FileCode2, FolderPlus, ListMinus, Trash2 } from 'lucide-react';

import { isManualVirtualNodeFilter } from '../../../lib/core/nodes/virtualNodeFilter';
import { NodeContextMenuItem, NodeContextMenuSeparator } from '../../features/nodes/components/nodeListContextMenuPresentation';
import { NodeRenameContextMenuItem } from '../../features/nodes/components/NodeRenameContextMenuItem';
import { requestNodeRename } from '../../features/nodes/components/NodeTreeRowRename';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuTrigger } from '../../shared/ui';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { ConvertDiveDirectoryMenuItem } from './ConvertDiveDirectoryMenuItem';

interface WorkspaceVirtualSavedSearchContextMenuProps {
  left: number;
  isVirtualRoot?: boolean;
  isSystemEntry?: boolean;
  nodeId: string;
  onClose: () => void;
  onCreateChild: (nodeId?: string) => void;
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

function CreateChildMenuItem(props: { nodeId?: string; onClose: () => void; onCreate: (nodeId?: string) => void }) {
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

function RemoveFolderSourceItems({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const t = useTranslation();
  const nodesById = useWorkspaceStore(state => state.nodesById);
  const folder = nodesById[nodeId];
  if (!isManualVirtualNodeFilter(folder?.virtualFilter)) return null;
  const sourceIds = folder?.manualChildOrder ?? [];
  return sourceIds.map(id => {
    const source = nodesById[id];
    if (source?.kind !== 'folder') return null;
    return (
      <NodeContextMenuItem key={id} icon={ListMinus} onSelect={() => {
        const state = useWorkspaceStore.getState();
        const current = state.nodesById[nodeId]?.manualChildOrder ?? [];
        void state.setFolderManualChildOrder?.(nodeId, current.filter(sourceId => sourceId !== id));
        onClose();
      }}>
        {t('desktop.nodeList.menu.removeFromCurrentVirtualFolder')} · {source.title}
      </NodeContextMenuItem>
    );
  });
}

function DeleteVirtualFolderMenuItem(props: { onDelete: () => void }) {
  return <NodeContextMenuItem icon={Trash2} onSelect={props.onDelete} tone="destructive">
    Delete
  </NodeContextMenuItem>;
}

export function WorkspaceVirtualSavedSearchContextMenu({
  left,
  isVirtualRoot = false,
  isSystemEntry = false,
  nodeId,
  onClose,
  onCreateChild,
  onDelete,
  onWriteTopicYaml,
  top
}: WorkspaceVirtualSavedSearchContextMenuProps) {
  const isSavedSearch = !isSystemEntry;
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
        {isVirtualRoot || isSavedSearch
          ? <CreateChildMenuItem {...(!isVirtualRoot ? { nodeId } : {})} onClose={onClose} onCreate={onCreateChild} />
          : null}
        {isVirtualRoot || isSavedSearch ? <NodeContextMenuSeparator /> : null}
        <NodeRenameContextMenuItem onSelect={() => {
          requestNodeRename(nodeId);
          onClose();
        }} />
        {isSavedSearch ? (
          <>
            <ConvertDiveDirectoryMenuItem nodeId={nodeId} target="dive" onClose={onClose} />
            <RemoveFolderSourceItems nodeId={nodeId} onClose={onClose} />
            {onWriteTopicYaml ? (
              <WriteTopicYamlMenuItem nodeId={nodeId} onClose={onClose} onWrite={onWriteTopicYaml} />
            ) : null}
            <NodeContextMenuSeparator />
            <DeleteVirtualFolderMenuItem onDelete={() => {
              onDelete(nodeId);
              onClose();
            }} />
          </>
        ) : null}
      </AppDropdownMenuContent>
    </AppDropdownMenu>
  );
}

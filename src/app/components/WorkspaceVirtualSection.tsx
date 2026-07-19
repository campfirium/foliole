import { useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { buildNodeTree, buildVisibleNodeTreeRows } from '../../features/nodes/model/nodeTree';
import {
  VIRTUAL_SHELVED_NODE_ID,
  VIRTUAL_REMOVED_NODE_ID,
  isVirtualNode,
  isVirtualRootNode
} from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useTranslation, type Translate } from '../../shared/localization/LocalizationProvider';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useWorkspaceVirtualFolderDrop } from './workspaceVirtualFolderDrop';
import { compareVirtualNodeTitle } from './workspaceVirtualNodeSort';
import { WorkspaceVirtualSavedSearchContextMenu } from './WorkspaceVirtualSavedSearchContextMenu';
import { getVirtualKeyboardRows, renderVirtualRows, toggleCollapsed } from './WorkspaceVirtualSectionRows';
import {
  canWriteVirtualFolderInfoToTopicYaml,
  writeVirtualFolderInfoToTopicYaml
} from './writeVirtualFolderInfoToTopicYaml';

interface WorkspaceVirtualSectionProps {
  activeVirtualNodeId?: string | null;
  hideInDemo?: boolean;
  isVirtualViewOpen: boolean;
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onOpenVirtualView?: (nodeId?: string) => void;
  onSelectNodeInVirtualView: (nodeId: string) => void;
  virtualResultCountById?: ReadonlyMap<string, number> | undefined;
}

function selectVirtualKeyboardRow(nodeId: string, props: WorkspaceVirtualSectionProps) {
  if (nodeId === VIRTUAL_REMOVED_NODE_ID || nodeId === VIRTUAL_SHELVED_NODE_ID) {
    props.onOpenVirtualView?.(nodeId);
    return;
  }
  props.onOpenVirtualView?.(nodeId);
  props.onSelectNodeInVirtualView(nodeId);
}

function getContextMenuPosition(event: ReactMouseEvent<HTMLElement>) {
  return {
    left: Math.max(8, Math.min(event.clientX, window.innerWidth - 220)),
    top: Math.max(8, Math.min(event.clientY, window.innerHeight - 72))
  };
}

function buildWorkspaceVirtualRows(
  props: WorkspaceVirtualSectionProps,
  collapsedIds: Set<string>
) {
  const virtualNodeIds = props.nodeOrder.filter((nodeId) => {
    const node = props.nodesById[nodeId];
    return isVirtualRootNode(node) || isVirtualNode(node);
  }).sort((leftId, rightId) => compareVirtualNodeTitle(leftId, rightId, props.nodesById));
  return buildVisibleNodeTreeRows(buildNodeTree(virtualNodeIds, props.nodesById).rows, collapsedIds);
}

function renderSavedSearchContextMenu(args: {
  contextMenu: { left: number; nodeId: string; top: number } | null;
  deleteNode: (nodeId: string) => void;
  isWritingTopicYaml: boolean;
  onWriteTopicYaml: (nodeId: string) => void;
  setContextMenu: (value: { left: number; nodeId: string; top: number } | null) => void;
}) {
  if (!args.contextMenu) return null;
  return (
    <WorkspaceVirtualSavedSearchContextMenu
      left={args.contextMenu.left}
      nodeId={args.contextMenu.nodeId}
      onClose={() => args.setContextMenu(null)}
      onDelete={args.deleteNode}
      {...(!args.isWritingTopicYaml && canWriteVirtualFolderInfoToTopicYaml(args.contextMenu.nodeId)
        ? { onWriteTopicYaml: args.onWriteTopicYaml }
        : {})}
      top={args.contextMenu.top}
    />
  );
}

function useVirtualFolderActions(
  t: Translate,
  updateNodeTitle: (nodeId: string, title: string) => Promise<boolean>
) {
  const [isWritingTopicYaml, setIsWritingTopicYaml] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  return {
    isWritingTopicYaml,
    onRename: (nodeId: string, title: string) => {
      setStatus(null);
      void updateNodeTitle(nodeId, title).then((updated) => {
        if (!updated) setStatus(t('desktop.workspace.virtualFolderRename.failed'));
      });
    },
    onWriteTopicYaml: (nodeId: string) => {
      setIsWritingTopicYaml(true);
      setStatus(null);
      void writeVirtualFolderInfoToTopicYaml(nodeId).then((result) => {
        setStatus(result.failed > 0
          ? t('desktop.workspace.virtualFolderYaml.partial', { ...result })
          : t('desktop.workspace.virtualFolderYaml.complete', { ...result }));
      }).finally(() => setIsWritingTopicYaml(false));
    },
    status
  };
}

export function WorkspaceVirtualSection(props: WorkspaceVirtualSectionProps) {
  const t = useTranslation();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<{ left: number; nodeId: string; top: number } | null>(null);
  const deleteNode = useWorkspaceStore((state) => state.deleteNode);
  const updateNodeTitle = useWorkspaceStore((state) => state.updateNodeTitle);
  const actions = useVirtualFolderActions(t, updateNodeTitle);
  const drop = useWorkspaceVirtualFolderDrop();
  const rows = useMemo(
    () => buildWorkspaceVirtualRows(props, collapsedIds),
    [collapsedIds, props.nodeOrder, props.nodesById]
  );
  const keyboardRows = useMemo(() => getVirtualKeyboardRows(rows, collapsedIds), [collapsedIds, rows]);
  const onRowKeyDown = useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds: collapsedIds,
        onSelect: (nodeId) => selectVirtualKeyboardRow(nodeId, props),
        onToggleCollapse: (nodeId) => toggleCollapsed(nodeId, setCollapsedIds),
        rows: keyboardRows
      }),
    [collapsedIds, keyboardRows, props]
  );

  if (props.hideInDemo || rows.length === 0) return null;

  return (
    <div className="mt-1 flex min-w-0 flex-col">
      <div aria-hidden="true" className="mx-4 border-t border-border/15" />
      <section aria-label={t('desktop.workspace.virtualFolderTree')} className="flex flex-col pt-1" role="tree">
        {renderVirtualRows({
          collapsedIds,
          onRowKeyDown,
          props: {
            ...props,
            onContextMenuSavedSearch: (nodeId, event) => {
              event.preventDefault();
              setContextMenu({ nodeId, ...getContextMenuPosition(event) });
            },
            onDeleteVirtualNode: deleteNode,
            onDragLeaveVirtualFolder: drop.onDragLeave,
            onDragOverVirtualFolder: drop.onDragOver,
            onDropOnVirtualFolder: drop.onDrop,
            onRenameVirtualNode: actions.onRename
          },
          dropTargetNodeId: drop.targetId,
          rowSpacing: getNodeListRowSpacing(),
          rows,
          setCollapsedIds
        })}
        {renderSavedSearchContextMenu({
          contextMenu,
          deleteNode,
          isWritingTopicYaml: actions.isWritingTopicYaml,
          onWriteTopicYaml: actions.onWriteTopicYaml,
          setContextMenu
        })}
        {actions.status ? <p aria-live="polite" className="px-4 py-1 text-xs text-foreground/65">{actions.status}</p> : null}
      </section>
    </div>
  );
}

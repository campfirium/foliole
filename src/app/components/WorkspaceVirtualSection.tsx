import {
  useMemo,
  useState,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction
} from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { buildNodeTree, buildVisibleNodeTreeRows } from '../../features/nodes/model/nodeTree';
import {
  VIRTUAL_ROOT_NODE_ID,
  VIRTUAL_SHELVED_NODE_ID,
  VIRTUAL_REMOVED_NODE_ID,
  isVirtualNode,
  isVirtualRootNode
} from '../../features/nodes/model/specialNodes';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useLocalization, type Translate } from '../../shared/localization/LocalizationProvider';
import { resolveNodeDisplayTitle, resolveSystemEntryId } from '../../shared/localization/systemEntryNames';
import { renameRuntimeSystemEntry } from '../../shared/platform/desktop/systemEntryDisplayNamesRuntimeRepository';
import { useDemoRuntimeState } from '../../shared/platform/runtime/demoRuntime';
import { showAppRuntimeNotice } from '../../shared/ui/AppRuntimeNotice';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { useCreateVirtualFolder } from './useCreateVirtualFolder';
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
  onCreateChild: (nodeId?: string) => void;
  onWriteTopicYaml: (nodeId: string) => void;
  setContextMenu: (value: { left: number; nodeId: string; top: number } | null) => void;
}) {
  if (!args.contextMenu) return null;
  return (
    <WorkspaceVirtualSavedSearchContextMenu
      left={args.contextMenu.left}
      isVirtualRoot={args.contextMenu.nodeId === VIRTUAL_ROOT_NODE_ID}
      isSystemEntry={Boolean(resolveSystemEntryId(args.contextMenu.nodeId))}
      nodeId={args.contextMenu.nodeId}
      onClose={() => args.setContextMenu(null)}
      onCreateChild={args.onCreateChild}
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
  updateNodeTitle: (nodeId: string, title: string) => Promise<boolean>,
  demo: boolean
) {
  const [isWritingTopicYaml, setIsWritingTopicYaml] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  return {
    isWritingTopicYaml,
    onRename: (nodeId: string, title: string) => {
      setStatus(null);
      const rename = resolveSystemEntryId(nodeId)
        ? renameRuntimeSystemEntry(nodeId, title, { demo })
        : updateNodeTitle(nodeId, title);
      void rename.then((updated) => {
        if (!updated) setStatus(t('desktop.workspace.virtualFolderRename.failed'));
      }).catch(() => {
        showAppRuntimeNotice(t('settings.general.systemEntryNames.saveFailed'));
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
    setStatus,
    status
  };
}

function useVirtualSectionTreeModel(
  props: WorkspaceVirtualSectionProps,
  collapsedIds: Set<string>,
  setCollapsedIds: Dispatch<SetStateAction<Set<string>>>
) {
  const rows = useMemo(
    () => buildWorkspaceVirtualRows(props, collapsedIds),
    [collapsedIds, props.nodeOrder, props.nodesById]
  );
  const keyboardRows = useMemo(() => getVirtualKeyboardRows(rows, collapsedIds), [collapsedIds, rows]);
  const onRowKeyDown = useMemo(() => createNodeListRowKeydownHandler({
    collapsedNodeIds: collapsedIds,
    onSelect: (nodeId) => selectVirtualKeyboardRow(nodeId, props),
    onToggleCollapse: (nodeId) => toggleCollapsed(nodeId, setCollapsedIds),
    rows: keyboardRows
  }), [collapsedIds, keyboardRows, props, setCollapsedIds]);
  return { onRowKeyDown, rows };
}

export function WorkspaceVirtualSection(props: WorkspaceVirtualSectionProps) {
  const { locale, t } = useLocalization();
  const { isDemo } = useDemoRuntimeState();
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<{ left: number; nodeId: string; top: number } | null>(null);
  const deleteNode = useWorkspaceStore((state) => state.deleteNode);
  const updateNodeTitle = useWorkspaceStore((state) => state.updateNodeTitle);
  const actions = useVirtualFolderActions(t, updateNodeTitle, isDemo);
  const createVirtualFolder = useCreateVirtualFolder({
    failedMessage: t('desktop.nodeList.createVirtualFolderFailed'),
    nodesById: props.nodesById,
    onSelectNodeInVirtualView: props.onSelectNodeInVirtualView,
    setStatus: actions.setStatus,
    ...(props.onOpenVirtualView ? { onOpenVirtualView: props.onOpenVirtualView } : {})
  });
  const drop = useWorkspaceVirtualFolderDrop();
  const tree = useVirtualSectionTreeModel(props, collapsedIds, setCollapsedIds);

  if (props.hideInDemo || tree.rows.length === 0) return null;

  return (
    <div className="mt-1 flex min-w-0 flex-col">
      <div aria-hidden="true" className="mx-4 border-t border-border/15" />
      <section aria-label={t('desktop.workspace.virtualFolderTree')} className="flex flex-col pt-1" role="tree">
        {renderVirtualRows({
          collapsedIds,
          onRowKeyDown: tree.onRowKeyDown,
          props: {
            ...props,
            onContextMenuVirtualNode: (nodeId, event) => {
              event.preventDefault();
              setContextMenu({ nodeId, ...getContextMenuPosition(event) });
            },
            onDeleteVirtualNode: deleteNode,
            onDragEndVirtualFolder: drop.onDragEnd,
            onDragEnterVirtualFolder: drop.onDragEnter,
            onDragLeaveVirtualFolder: drop.onDragLeave,
            onDragOverVirtualFolder: drop.onDragOver,
            onDragStartVirtualFolder: drop.onDragStart,
            onDropOnVirtualFolder: drop.onDrop,
            onRenameVirtualNode: actions.onRename,
            resolveSystemTitle: (nodeId, storedTitle) => resolveNodeDisplayTitle(locale, nodeId, storedTitle)
          },
          dropTargetNodeId: drop.targetId,
          rowSpacing: getNodeListRowSpacing(),
          rows: tree.rows,
          setCollapsedIds
        })}
        {renderSavedSearchContextMenu({
          contextMenu,
          deleteNode,
          isWritingTopicYaml: actions.isWritingTopicYaml,
          onCreateChild: (nodeId) => void createVirtualFolder(nodeId),
          onWriteTopicYaml: actions.onWriteTopicYaml,
          setContextMenu
        })}
        {actions.status ? <p aria-live="polite" className="px-4 py-1 text-xs text-foreground/65">{actions.status}</p> : null}
      </section>
    </div>
  );
}

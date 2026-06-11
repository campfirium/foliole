import { useMemo, useRef, useState, type RefObject } from 'react';

import { getNodeListRowSpacing } from '../../features/nodes/components/nodeListRowSpacingSettings';
import { NodeListStateSurface } from '../../features/nodes/components/NodeListStateSurface';
import { useNodeListContextMenu } from '../../features/nodes/components/NodeListTreeHooks';
import { createNodeListRowKeydownHandler } from '../../features/nodes/components/NodeListTreeKeyboard';
import { NodeListTreeMenu } from '../../features/nodes/components/NodeListTreeMenu';
import { useNodeListState, useNodeSelectionHandler } from '../../features/nodes/components/NodeListTreeState';
import { TrashListRows } from '../../features/nodes/components/TrashListRows';
import { buildFlatNodeRows } from '../../features/nodes/model/nodeTree';
import { filterTrashRootIdsByTitle, selectTrashRootIds } from '../../features/nodes/model/trashRootModel';
import type { WorkspaceListNodesById } from '../../features/nodes/model/workspaceListNode';
import { useTranslation } from '../../shared/localization/LocalizationProvider';
import { useWorkspaceStore } from '../../store/workspaceStore';
import { useWorkspaceContentSort } from '../hooks/useWorkspaceContentSort';

import { TrashResultHeader } from './TrashResultHeader';
import { normalizeWorkspaceContentSort, sortTrashContentRows } from './workspaceContentSort';

interface TrashResultListPanelProps {
  nodeOrder: string[];
  nodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
  onSelectTrashNode: (nodeId: string) => void;
  selectedTrashNodeId: string | null;
  trashedNodeIds: string[];
}

function useTrashRows(props: TrashResultListPanelProps, searchQuery: string) {
  const contentSort = useWorkspaceContentSort();
  const deletedAtById = useWorkspaceStore((state) => state.trashedNodeDeletedAtById);
  const normalizedSort = normalizeWorkspaceContentSort(contentSort.sort, ['deletedAt', 'name']);
  const rows = useMemo(() => {
    const rootIds = selectTrashRootIds(props.nodeOrder, props.nodesById, props.trashedNodeIds);
    const filteredRootIds = filterTrashRootIdsByTitle(rootIds, props.nodeOrder, props.nodesById, props.trashedNodeIds, searchQuery);
    const trashRows = buildFlatNodeRows(filteredRootIds, props.nodesById);
    const sortedRows = sortTrashContentRows(trashRows, normalizedSort, deletedAtById);
    return sortedRows;
  }, [deletedAtById, normalizedSort, props.nodeOrder, props.nodesById, props.trashedNodeIds, searchQuery]);

  return { contentSort, normalizedSort, rows };
}

function TrashRowsBody(props: {
  contextMenu: ReturnType<typeof useNodeListContextMenu>;
  nodesById: WorkspaceListNodesById;
  rowSpacing: number;
  rows: ReturnType<typeof useTrashRows>['rows'];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  selectTrashNode: ReturnType<typeof useNodeSelectionHandler>;
  selectedNodeIds: string[];
}) {
  const t = useTranslation();
  const onRowKeyDown = useMemo(
    () =>
      createNodeListRowKeydownHandler({
        collapsedNodeIds: new Set(),
        onSelect: props.selectTrashNode,
        onToggleCollapse: () => undefined,
        rows: props.rows
      }),
    [props.rows, props.selectTrashNode]
  );

  return (
    <NodeListStateSurface
      className="flex min-h-full items-center justify-center py-6"
      emptyState={{
        description: t('desktop.nodeList.trash.empty.description'),
        title: t('desktop.nodeList.trash.empty.title')
      }}
      hasRows={props.rows.length > 0}
    >
      <div aria-label={t('desktop.nodeList.trash.topics')} className="flex flex-col gap-2" role="tree">
        <TrashListRows
          activeNodeId={props.selectedNodeIds[0] ?? null}
          nodesById={props.nodesById}
          onContextMenu={props.contextMenu.openContextMenu}
          onKeyDown={onRowKeyDown}
          onSelect={props.selectTrashNode}
          rows={props.rows}
          rowSpacing={props.rowSpacing}
          scrollContainerRef={props.scrollContainerRef}
          selectedNodeIds={props.selectedNodeIds}
        />
      </div>
    </NodeListStateSurface>
  );
}

function TrashContextMenu(props: {
  contextMenu: ReturnType<typeof useNodeListContextMenu>;
  listState: ReturnType<typeof useNodeListState>;
  nodesById: WorkspaceListNodesById;
  onSelectNode: (nodeId: string) => void;
  selectTrashNode: ReturnType<typeof useNodeSelectionHandler>;
  workspaceActions: ReturnType<typeof useTrashWorkspaceActions>;
}) {
  return (
    <NodeListTreeMenu
      contextMenu={props.contextMenu}
      createChildNode={props.workspaceActions.createChildNode}
      createGlobalNode={props.workspaceActions.createGlobalNode}
      createVirtualNode={props.workspaceActions.createVirtualNode}
      deleteNodes={props.workspaceActions.deleteNodes}
      deleteNodesPermanently={props.workspaceActions.deleteNodesPermanently}
      dismissNode={props.workspaceActions.dismissNode}
      isVirtualViewOpen={false}
      nodesById={props.nodesById}
      onOpenMoveToNode={() => undefined}
      onSelect={props.selectTrashNode}
      restoreNode={async (nodeId) => {
        const shouldStayInTrash = props.listState.selectedNodeIds.length > 1;
        const targetNodeId = await props.workspaceActions.restoreNode(nodeId);
        if (!shouldStayInTrash) {
          props.onSelectNode(targetNodeId ?? nodeId);
        }
      }}
      returnNode={props.workspaceActions.returnNode}
      setNodeSequentialReading={props.workspaceActions.setNodeSequentialReading}
      shelveNode={props.workspaceActions.shelveNode}
      state={props.listState}
      unshelveNode={props.workspaceActions.unshelveNode}
    />
  );
}

function useRenderedTrashListState(
  listState: ReturnType<typeof useNodeListState>,
  rows: ReturnType<typeof useTrashRows>['rows']
) {
  const rowIds = useMemo(() => rows.map((row) => row.node.id), [rows]);
  const rowIdSet = useMemo(() => new Set(rowIds), [rowIds]);
  const renderedListState = useMemo(
    () => ({
      ...listState,
      trashRows: rows,
      trashRowsAll: rows,
      trashRowIds: rowIds
    }),
    [listState, rowIds, rows]
  );
  const selectedNodeIds = listState.selectedNodeIds.filter((nodeId) => rowIdSet.has(nodeId));

  return { renderedListState, selectedNodeIds };
}

export function TrashResultListPanel(props: TrashResultListPanelProps) {
  const t = useTranslation();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const rowSpacing = getNodeListRowSpacing();
  const { contentSort, normalizedSort, rows } = useTrashRows(props, searchQuery);
  const listState = useNodeListState(null, true, props.nodeOrder, props.nodesById, props.selectedTrashNodeId, new Set());
  const { renderedListState, selectedNodeIds } = useRenderedTrashListState(listState, rows);
  const contextMenu = useNodeListContextMenu(props.nodesById, selectedNodeIds, props.trashedNodeIds);
  const selectTrashNode = useNodeSelectionHandler({
    activeNodeId: null,
    isSelectionScopeActive: true,
    nodesById: props.nodesById,
    onSelectNode: () => undefined,
    onSelectTrashNode: props.onSelectTrashNode,
    selectedTrashNodeId: props.selectedTrashNodeId,
    state: renderedListState,
    trashedNodeIds: props.trashedNodeIds
  });
  const workspaceActions = useTrashWorkspaceActions();

  return (
    <aside aria-label={t('desktop.workspaceList.topicPanel')} className="workspace-region-main-topic flex min-h-0 min-w-0 flex-1 flex-col text-foreground">
      <TrashResultHeader
        contentSort={contentSort}
        isSearchOpen={isSearchOpen}
        onCloseSearch={() => {
          setSearchQuery('');
          setIsSearchOpen(false);
        }}
        onOpenSearch={() => setIsSearchOpen(true)}
        onSearchQueryChange={setSearchQuery}
        normalizedSort={normalizedSort}
        searchQuery={searchQuery}
        trashedNodeIds={props.trashedNodeIds}
      />
      <div className="app-scrollbar workspace-region-main-topic min-h-0 flex-1 overflow-y-auto px-4 py-2" ref={scrollContainerRef}>
        <TrashRowsBody
          contextMenu={contextMenu}
          nodesById={props.nodesById}
          rowSpacing={rowSpacing}
          rows={rows}
          scrollContainerRef={scrollContainerRef}
          selectTrashNode={selectTrashNode}
          selectedNodeIds={selectedNodeIds}
        />
      </div>
      <TrashContextMenu
        contextMenu={contextMenu}
        listState={renderedListState}
        nodesById={props.nodesById}
        onSelectNode={props.onSelectNode}
        selectTrashNode={selectTrashNode}
        workspaceActions={workspaceActions}
      />
    </aside>
  );
}

function useTrashWorkspaceActions() {
  return {
    createChildNode: useWorkspaceStore((state) => state.createChildNode),
    createGlobalNode: useWorkspaceStore((state) => state.createRootNode),
    createVirtualNode: useWorkspaceStore((state) => state.createVirtualNode),
    deleteNodes: useWorkspaceStore((state) => state.deleteNodes),
    deleteNodesPermanently: useWorkspaceStore((state) => state.deleteNodesPermanently),
    dismissNode: useWorkspaceStore((state) => state.dismissNode),
    restoreNode: useWorkspaceStore((state) => state.restoreNode),
    returnNode: useWorkspaceStore((state) => state.relearnNode),
    setNodeSequentialReading: useWorkspaceStore((state) => state.setNodeSequentialReading),
    shelveNode: useWorkspaceStore((state) => state.shelveNode),
    unshelveNode: useWorkspaceStore((state) => state.unshelveNode)
  };
}

import { useEffect, useRef, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';

import { findFolderTopicItemCommandByAppCommandId } from '../../../../lib/core/nodes/folderTopicItemCommands';
import { VIRTUAL_NODE_APP_COMMAND_ID } from '../../../../lib/core/nodes/virtualNodeCommands';
import type { ReviewSessionState } from '../../../store/workspaceStore';
import type { NodeTreeRow } from '../model/nodeTree';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { scrollActiveTreeItemIntoView } from './nodeListAutoScroll';
import { renderDeleteStatusOverlay } from './NodeListFeedbackSurface';
import { NodeListHeader } from './NodeListHeader';
import { resolveNodeListRowGap } from './nodeListRowSpacingSettings';
import { useNodeListDragController } from './NodeListTreeDrag';
import type {
  NodeListCollapseController,
  NodeListContextMenuController
} from './NodeListTreeHooks';
import { NodeListTreeMenu } from './NodeListTreeMenu';
import { NodeListRows } from './NodeListTreeRows';
import type { NodeListState, NodeSelectModifiers } from './NodeListTreeState';
import { resolveNodeTreeClassName } from './NodeTreeRowStyle';
import { useNodeListSearchRows } from './useNodeListSearchRows';
import { useNodeListVisibleDocumentPrefetch } from './useNodeListVisibleDocumentPrefetch';

interface NodeListPanelProps {
  activeCollapsedNodeIds: ReadonlySet<string>;
  activeNodeId: string | null;
  activeRows: NodeTreeRow[];
  collapse: NodeListCollapseController;
  contextMenu: NodeListContextMenuController;
  createGlobalNode: (content?: string, kind?: 'folder' | 'topic' | 'item') => string;
  createVirtualNode: () => string;
  deleteNodesPermanently: (nodeIds: string[]) => void;
  deleteStatusLabel: string | null;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  moveNodes: (
    nodeIds: string[],
    targetNodeId: string | null,
    intent: 'before' | 'after' | 'child' | 'root'
  ) => boolean;
  nodesById: WorkspaceListNodesById;
  noteRowIds: string[];
  onOpenNotesView: () => void;
  onRenameNode: (nodeId: string, title: string) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  reviewSession: ReviewSessionState;
  rowSpacing: number;
  searchQuery: string;
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
  showVirtualCreateAction: boolean;
  showTitleSearch: boolean;
  trashRowIds: string[];
  trashRowsLength: number;
  onSearchQueryChange: (searchQuery: string) => void;
}

function renderRootDropHint(isRootDropActive: boolean) {
  if (!isRootDropActive) {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className="rounded border border-dashed border-border-strong bg-foreground/[0.04] px-3 py-2 text-xs text-foreground/70"
    >
      Drop to move node to root
    </div>
  );
}

function renderNodeTreeSection(props: NodeListPanelProps, drag: ReturnType<typeof useNodeListDragController>) {
  const handleBlankAreaContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    if (props.isTrashViewOpen) {
      return;
    }
    const target = event.target as HTMLElement | null;
    if (target?.closest('[role="treeitem"]')) {
      return;
    }
    props.contextMenu.openRootContextMenu(event);
  };

  return (
    <section
      aria-multiselectable="true"
      aria-label={props.isTrashViewOpen ? 'Trash section' : undefined}
      className={resolveNodeTreeClassName()}
      data-node-list-row-gap={String(resolveNodeListRowGap(props.rowSpacing))}
      data-node-list-row-spacing={String(props.rowSpacing)}
      role="tree"
      style={{ gap: `${resolveNodeListRowGap(props.rowSpacing)}px` }}
      onContextMenu={handleBlankAreaContextMenu}
      onDoubleClick={(event) => event.target === event.currentTarget && !props.isVirtualViewOpen && props.createGlobalNode('')}
      onDragOver={(event) => event.target === event.currentTarget && drag.onDragOverRoot(event)}
      onDrop={(event) => event.target === event.currentTarget && drag.onDropRoot(event)}
    >
      {renderRootDropHint(drag.isRootDropActive)}
      <NodeListRows
        activeNodeId={props.activeNodeId}
        collapsedNodeIds={props.activeCollapsedNodeIds}
        drag={drag}
        isTrashViewOpen={props.isTrashViewOpen}
        isVirtualViewOpen={props.isVirtualViewOpen}
        nodesById={props.nodesById}
        onContextMenu={props.contextMenu.openContextMenu}
        onRename={props.onRenameNode}
        onSelect={props.onSelect}
        onToggleCollapse={props.collapse.toggleCollapse}
        reviewSession={props.reviewSession}
        rowSpacing={props.rowSpacing}
        rows={props.activeRows}
        selectedNodeIds={props.selectedNodeIds}
        selectedTrashNodeId={props.selectedTrashNodeId}
      />
    </section>
  );
}

function useNodeListPanelEffects(
  props: Pick<NodeListPanelProps, 'activeNodeId' | 'activeRows' | 'isTrashViewOpen' | 'isVirtualViewOpen'>,
  scrollContainerRef: RefObject<HTMLDivElement | null>
) {
  useEffect(() => {
    if (!props.activeNodeId || props.isTrashViewOpen) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      scrollActiveTreeItemIntoView(scrollContainerRef.current, props.activeNodeId);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [props.activeNodeId, props.isTrashViewOpen, props.isVirtualViewOpen, scrollContainerRef]);

  useNodeListVisibleDocumentPrefetch({
    activeNodeId: props.activeNodeId,
    activeRows: props.activeRows,
    isTrashViewOpen: props.isTrashViewOpen,
    isVirtualViewOpen: props.isVirtualViewOpen,
    scrollContainerRef
  });
}

function NodeListPanel(props: NodeListPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const drag = useNodeListDragController({
    disableRootDrop: props.isTrashViewOpen || props.isVirtualViewOpen,
    isTrashViewOpen: props.isTrashViewOpen,
    moveNodes: props.moveNodes,
    nodesById: props.nodesById,
    noteRowIds: props.noteRowIds,
    selectedNodeIds: props.selectedNodeIds
  });
  useNodeListPanelEffects(props, scrollContainerRef);

  return (
    <aside aria-label="Node list panel" className="flex min-h-0 min-w-0 flex-1 flex-col bg-bg-panel text-foreground">
      <NodeListHeader
        isTrashViewOpen={props.isTrashViewOpen}
        isVirtualViewOpen={props.isVirtualViewOpen}
        showVirtualCreateAction={props.showVirtualCreateAction}
        onCollapseAll={props.collapse.collapseAllNotes}
        onCreateCommand={(commandId) => {
          if (commandId === VIRTUAL_NODE_APP_COMMAND_ID) {
            props.createVirtualNode();
            return;
          }
          const command = findFolderTopicItemCommandByAppCommandId(commandId);
          if (!command) {
            return;
          }
          props.createGlobalNode('', command.kind);
        }}
        onEmptyTrash={() => (props.deleteNodesPermanently(props.trashRowIds), props.contextMenu.closeContextMenu())}
        onExpandAll={props.collapse.expandAllNotes}
        onOpenNotesView={props.onOpenNotesView}
        onSearchQueryChange={props.onSearchQueryChange}
        searchQuery={props.searchQuery}
        showTitleSearch={props.showTitleSearch}
        trashCount={props.trashRowsLength}
      />
      <div className="relative min-h-0 flex-1">
        {renderDeleteStatusOverlay(props.deleteStatusLabel)}
        <div className="app-scrollbar flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden px-4 py-2" ref={scrollContainerRef}>
          {renderNodeTreeSection(props, drag)}
        </div>
      </div>
    </aside>
  );
}

interface NodeListTreeContentProps {
  activeCollapsedNodeIds: ReadonlySet<string>;
  activeNodeId: string | null;
  activeRows: NodeTreeRow[];
  collapse: NodeListCollapseController;
  contextMenu: NodeListContextMenuController;
  createChildNode: (parentNodeId: string, content?: string, kind?: 'folder' | 'topic' | 'item') => string;
  createGlobalNode: (content?: string, kind?: 'folder' | 'topic' | 'item') => string;
  createVirtualNode: () => string;
  deleteNodes: (nodeIds: string[]) => void;
  deleteNodesPermanently: (nodeIds: string[]) => void;
  deleteStatusLabel: string | null;
  dismissNode: (nodeId: string, now?: string) => boolean;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  moveNodes: (
    nodeIds: string[],
    targetNodeId: string | null,
    intent: 'before' | 'after' | 'child' | 'root'
  ) => boolean;
  nodesById: WorkspaceListNodesById;
  onOpenNotesView: () => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onOpenMoveToNode: () => void;
  reviewSession: ReviewSessionState;
  rowSpacing: number;
  returnNode: (nodeId: string, now?: string) => boolean;
  updateNodeTitle: (nodeId: string, title: string) => void;
  restoreNode: (nodeId: string) => void;
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
  showVirtualCreateAction?: boolean;
  showTitleSearch: boolean;
  state: NodeListState;
}

export function NodeListTreeContent(props: NodeListTreeContentProps) {
  const { filteredActiveRows, searchQuery, setSearchQuery } = useNodeListSearchRows({
    activeRows: props.activeRows,
    isTrashViewOpen: props.isTrashViewOpen,
    isVirtualViewOpen: props.isVirtualViewOpen,
    noteRowsAll: props.state.noteRowsAll,
    trashRowsAll: props.state.trashRowsAll
  });

  return (
    <>
      <NodeListPanel
        activeCollapsedNodeIds={props.activeCollapsedNodeIds}
        activeNodeId={props.activeNodeId}
        activeRows={filteredActiveRows}
        collapse={props.collapse}
        contextMenu={props.contextMenu}
        createGlobalNode={props.createGlobalNode}
        createVirtualNode={props.createVirtualNode}
        deleteNodesPermanently={props.deleteNodesPermanently}
        deleteStatusLabel={props.deleteStatusLabel}
        isTrashViewOpen={props.isTrashViewOpen}
        isVirtualViewOpen={props.isVirtualViewOpen}
        moveNodes={props.moveNodes}
        nodesById={props.nodesById}
        noteRowIds={props.state.noteRowIds}
        onOpenNotesView={props.onOpenNotesView}
        onRenameNode={props.updateNodeTitle}
        onSearchQueryChange={setSearchQuery}
        onSelect={props.onSelect}
        reviewSession={props.reviewSession}
        rowSpacing={props.rowSpacing}
        searchQuery={searchQuery}
        selectedNodeIds={props.selectedNodeIds}
        selectedTrashNodeId={props.selectedTrashNodeId}
        showVirtualCreateAction={props.showVirtualCreateAction ?? true}
        showTitleSearch={props.showTitleSearch}
        trashRowIds={props.state.trashRowIds}
        trashRowsLength={props.state.trashRows.length}
      />
      <NodeListTreeMenu {...props} />
    </>
  );
}

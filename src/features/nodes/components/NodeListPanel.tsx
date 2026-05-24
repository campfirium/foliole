import type { ReactNode } from 'react';
import { useRef, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';

import { findFolderTopicItemCommandByAppCommandId } from '../../../../lib/core/nodes/folderTopicItemCommands';
import { VIRTUAL_NODE_APP_COMMAND_ID } from '../../../../lib/core/nodes/virtualNodeCommands';
import type { ReviewSessionState } from '../../../store/workspaceStore';
import type { NodeTreeRow } from '../model/nodeTree';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { renderDeleteStatusOverlay } from './NodeListFeedbackSurface';
import { NodeListHeader } from './NodeListHeader';
import { resolveNodeListRowGap } from './nodeListRowSpacingSettings';
import { getNodeListScrollContainerClassName } from './nodeListTreeContentLayout';
import { useNodeListDragController } from './NodeListTreeDrag';
import type {
  NodeListCollapseController,
  NodeListContextMenuController
} from './NodeListTreeHooks';
import { NodeListRows } from './NodeListTreeRows';
import type { NodeSelectModifiers } from './NodeListTreeState';
import { resolveNodeTreeClassName } from './NodeTreeRowStyle';
import { useNodeListVisibleDocumentPrefetch } from './useNodeListVisibleDocumentPrefetch';
import { useNodeTreeActiveItemScroll } from './useNodeTreeActiveItemScroll';

interface NodeListPanelProps {
  activeCollapsedNodeIds: ReadonlySet<string>;
  activeNodeId: string | null;
  activeRows: NodeTreeRow[];
  bodyAppendContent?: ReactNode;
  collapse: NodeListCollapseController;
  contextMenu: NodeListContextMenuController;
  createGlobalNode: (content?: string, kind?: 'folder' | 'topic' | 'item') => string;
  createVirtualNode: () => string;
  deleteNodesPermanently: (nodeIds: string[]) => void;
  deleteStatusLabel: string | null;
  highlightedNodeId: string | null;
  isTrashViewOpen: boolean;
  isVirtualViewOpen: boolean;
  moveNodes: (
    nodeIds: string[],
    targetNodeId: string | null,
    intent: 'before' | 'after' | 'child' | 'root'
  ) => Promise<boolean>;
  nodesById: WorkspaceListNodesById;
  noteRowIds: string[];
  onOpenNotesView: () => void;
  onRenameNode: (nodeId: string, title: string) => void;
  onSearchQueryChange: (searchQuery: string) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  reviewSession: ReviewSessionState;
  rowCountByNodeId?: ReadonlyMap<string, number> | undefined;
  rowSpacing: number;
  searchQuery: string;
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
  showTitleSearch: boolean;
  showVirtualCreateAction: boolean;
  trashRowIds: string[];
  trashRowsLength: number;
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
      Drop to move topic to root
    </div>
  );
}

function resolveNodeTreeSectionClassName(hasBodyAppendContent: boolean) {
  return hasBodyAppendContent ? 'flex flex-col' : resolveNodeTreeClassName();
}

function resolveNodeListPanelSurfaceClassName(isTrashViewOpen: boolean) {
  return isTrashViewOpen ? 'workspace-region-main-topic' : 'workspace-region-main-folder';
}

function renderNodeTreeSection(
  props: NodeListPanelProps,
  drag: ReturnType<typeof useNodeListDragController>,
  scrollContainerRef: RefObject<HTMLDivElement | null>
) {
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
      aria-label={props.isTrashViewOpen ? 'Trash topics' : 'Topic list'}
      className={resolveNodeTreeSectionClassName(Boolean(props.bodyAppendContent))}
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
        highlightedNodeId={props.highlightedNodeId}
        isTrashViewOpen={props.isTrashViewOpen}
        isVirtualViewOpen={props.isVirtualViewOpen}
        nodesById={props.nodesById}
        onContextMenu={props.contextMenu.openContextMenu}
        onExpandCollapse={props.collapse.expandNoteCollapse}
        onRename={props.onRenameNode}
        onSelect={props.onSelect}
        onToggleCollapse={props.collapse.toggleCollapse}
        reviewSession={props.reviewSession}
        rowCountByNodeId={props.rowCountByNodeId}
        rowSpacing={props.rowSpacing}
        rows={props.activeRows}
        scrollContainerRef={scrollContainerRef}
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
  useNodeTreeActiveItemScroll({
    activeNodeId: props.activeNodeId,
    disabled: props.isTrashViewOpen,
    scopeKey: props.isVirtualViewOpen,
    scrollContainerRef
  });

  useNodeListVisibleDocumentPrefetch({
    activeNodeId: props.activeNodeId,
    activeRows: props.activeRows,
    isTrashViewOpen: props.isTrashViewOpen,
    isVirtualViewOpen: props.isVirtualViewOpen,
    scrollContainerRef
  });
}

export function NodeListPanel(props: NodeListPanelProps) {
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
    <aside
      aria-label="Topic list panel"
      className={`${resolveNodeListPanelSurfaceClassName(props.isTrashViewOpen)} flex min-h-0 min-w-0 flex-1 flex-col text-foreground`}
    >
      <NodeListHeader
        hasCollapsibleNodes={props.collapse.hasCollapsibleNotes}
        hasCollapsedNodes={props.collapse.hasCollapsedNotes}
        isTrashViewOpen={props.isTrashViewOpen}
        isVirtualViewOpen={props.isVirtualViewOpen}
        showVirtualCreateAction={props.showVirtualCreateAction}
        onCreateCommand={(commandId) => {
          if (commandId === VIRTUAL_NODE_APP_COMMAND_ID) {
            props.createVirtualNode();
            return;
          }
          const command = findFolderTopicItemCommandByAppCommandId(commandId);
          if (command) {
            props.createGlobalNode('', command.kind);
          }
        }}
        onEmptyTrash={() => (props.deleteNodesPermanently(props.trashRowIds), props.contextMenu.closeContextMenu())}
        onOpenNotesView={props.onOpenNotesView}
        onSearchQueryChange={props.onSearchQueryChange}
        onToggleCollapseAll={() =>
          props.collapse.hasCollapsedNotes ? props.collapse.expandAllNotes() : props.collapse.collapseAllNotes()
        }
        searchQuery={props.searchQuery}
        showTitleSearch={props.showTitleSearch}
        trashCount={props.trashRowsLength}
      />
      <div className="relative min-h-0 flex-1">
        {renderDeleteStatusOverlay(props.deleteStatusLabel)}
        <div className={getNodeListScrollContainerClassName(props.isVirtualViewOpen)} ref={scrollContainerRef}>
          {renderNodeTreeSection(props, drag, scrollContainerRef)}
          {props.bodyAppendContent}
        </div>
      </div>
    </aside>
  );
}

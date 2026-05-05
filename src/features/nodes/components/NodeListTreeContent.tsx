import type { ReviewSessionState } from '../../../store/workspaceStore';
import type { NodeTreeRow } from '../model/nodeTree';
import type { Node } from '../model/nodeTypes';

import { NodeListContextMenu } from './NodeListContextMenu';
import { hasDismissTargets, hasReturnTargets } from './nodeListContextMenuReview';
import { NodeListHeader } from './NodeListHeader';
import { createDismissNodeAction, createReturnNodeAction } from './nodeListMenuActions';
import { resolveNodeListRowGap } from './nodeListRowSpacingSettings';
import { useNodeListDragController } from './NodeListTreeDrag';
import type {
  NodeListCollapseController,
  NodeListContextMenuController
} from './NodeListTreeHooks';
import { NodeListRows } from './NodeListTreeRows';
import type { NodeListState, NodeSelectModifiers } from './NodeListTreeState';
import { resolveNodeTreeClassName } from './NodeTreeRowStyle';

interface NodeListPanelProps {
  activeCollapsedNodeIds: ReadonlySet<string>;
  activeNodeId: string | null;
  activeRows: NodeTreeRow[];
  collapse: NodeListCollapseController;
  contextMenu: NodeListContextMenuController;
  createRootNode: (content?: string) => string;
  deleteNodesPermanently: (nodeIds: string[]) => void;
  deleteStatusLabel: string | null;
  isTrashViewOpen: boolean;
  moveNodes: (
    nodeIds: string[],
    targetNodeId: string | null,
    intent: 'before' | 'after' | 'child' | 'root'
  ) => boolean;
  nodesById: Record<string, Node>;
  noteRowIds: string[];
  onOpenNotesView: () => void;
  onRenameNode: (nodeId: string, title: string) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  reviewSession: ReviewSessionState;
  rowSpacing: number;
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
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
      Drop to move node to root
    </div>
  );
}

function renderNodeTreeSection(props: NodeListPanelProps, drag: ReturnType<typeof useNodeListDragController>) {
  return (
    <section
      aria-multiselectable="true"
      aria-label={props.isTrashViewOpen ? 'Trash section' : undefined}
      className={resolveNodeTreeClassName()}
      data-node-list-row-gap={String(resolveNodeListRowGap(props.rowSpacing))}
      data-node-list-row-spacing={String(props.rowSpacing)}
      role="tree"
      style={{ gap: `${resolveNodeListRowGap(props.rowSpacing)}px` }}
      onDoubleClick={(event) => event.target === event.currentTarget && props.createRootNode('')}
      onDragOver={(event) => event.target === event.currentTarget && drag.onDragOverRoot(event)}
      onDrop={(event) => event.target === event.currentTarget && drag.onDropRoot(event)}
    >
      {renderRootDropHint(drag.isRootDropActive)}
      <NodeListRows
        activeNodeId={props.activeNodeId}
        collapsedNodeIds={props.activeCollapsedNodeIds}
        drag={drag}
        isTrashViewOpen={props.isTrashViewOpen}
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

function NodeListPanel(props: NodeListPanelProps) {
  const drag = useNodeListDragController({
    isTrashViewOpen: props.isTrashViewOpen,
    moveNodes: props.moveNodes,
    nodesById: props.nodesById,
    noteRowIds: props.noteRowIds,
    selectedNodeIds: props.selectedNodeIds
  });
  return (
    <aside aria-label="Node list panel" className="flex min-h-0 flex-1 flex-col bg-bg-panel text-foreground">
      <NodeListHeader
        isTrashViewOpen={props.isTrashViewOpen}
        onCollapseAll={props.collapse.collapseAllNotes}
        onCreateRootNode={(event) => (event.stopPropagation(), props.createRootNode(''))}
        onEmptyTrash={() => (props.deleteNodesPermanently(props.trashRowIds), props.contextMenu.closeContextMenu())}
        onExpandAll={props.collapse.expandAllNotes}
        onOpenNotesView={props.onOpenNotesView}
        trashCount={props.trashRowsLength}
      />
      <div className="relative min-h-0 flex-1">
        {props.deleteStatusLabel ? (
          <div
            aria-live="polite"
            className="pointer-events-auto absolute inset-0 z-10 flex items-start bg-bg-panel/70 p-3 backdrop-blur-[1px]"
          >
            <div className="rounded-md border border-border bg-bg-panel px-3 py-2 text-sm font-medium text-foreground shadow-sm">
              {props.deleteStatusLabel}
            </div>
          </div>
        ) : null}
        <div className="app-scrollbar flex h-full min-h-0 flex-col overflow-y-auto overflow-x-hidden px-4 py-2">
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
  createChildNode: (parentNodeId: string, content?: string) => string;
  createRootNode: (content?: string) => string;
  deleteNodes: (nodeIds: string[]) => void;
  deleteNodesPermanently: (nodeIds: string[]) => void;
  deleteStatusLabel: string | null;
  dismissNode: (nodeId: string, now?: string) => boolean;
  isTrashViewOpen: boolean;
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: 'before' | 'after' | 'child' | 'root') => boolean; nodesById: Record<string, Node>;
  onOpenNotesView: () => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  reviewSession: ReviewSessionState;
  rowSpacing: number;
  returnNode: (nodeId: string, now?: string) => boolean;
  updateNodeTitle: (nodeId: string, title: string) => void;
  restoreNode: (nodeId: string) => void;
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
  state: NodeListState;
}

function NodeListTreeMenu(props: NodeListTreeContentProps) {
  if (!props.contextMenu.menuPosition) {
    return null;
  }

  const contextTargets = props.contextMenu.getContextTargets();
  const isNotesMenu = props.contextMenu.contextMenuMode === 'notes';
  const primaryTargetId = contextTargets[0] ?? null;
  const primaryTarget = primaryTargetId ? props.nodesById[primaryTargetId] : undefined;
  const showNodeImportActions = Boolean(isNotesMenu && primaryTarget && contextTargets.length === 1 && !primaryTarget.anchorLink);

  return (
    <NodeListContextMenu
      isTrashMenu={props.contextMenu.contextMenuMode === 'trash'}
      left={props.contextMenu.menuPosition.left}
      onClose={props.contextMenu.closeContextMenu}
      onCreateChildNode={() => (
        isNotesMenu &&
        contextTargets[0] &&
        props.createChildNode(contextTargets[0], ''),
        props.contextMenu.closeContextMenu()
      )}
      onCreateNode={() => (props.createRootNode(''), props.contextMenu.closeContextMenu())}
      onDeleteNode={() => (
        props.deleteNodes(contextTargets.sort((a, b) => props.state.noteRowIds.indexOf(a) - props.state.noteRowIds.indexOf(b))),
        props.contextMenu.closeContextMenu()
      )}
      onDeleteNodePermanently={() => (props.deleteNodesPermanently(contextTargets), props.contextMenu.closeContextMenu())}
      onDismissNode={createDismissNodeAction(contextTargets, props.dismissNode, props.contextMenu.closeContextMenu)}
      onImportIntoNode={props.contextMenu.closeContextMenu}
      onPasteIntoNode={props.contextMenu.closeContextMenu}
      onRestoreNode={() => (
        contextTargets.forEach((id) => props.restoreNode(id)),
        props.contextMenu.closeContextMenu()
      )}
      onReturnNode={createReturnNodeAction(contextTargets, props.returnNode, props.contextMenu.closeContextMenu)}
      showDismissAction={isNotesMenu && hasDismissTargets(contextTargets, props.nodesById)}
      showImportIntoNodeAction={showNodeImportActions}
      showPasteIntoNodeAction={showNodeImportActions}
      showReturnAction={isNotesMenu && hasReturnTargets(contextTargets, props.nodesById)}
      top={props.contextMenu.menuPosition.top}
    />
  );
}

export function NodeListTreeContent(props: NodeListTreeContentProps) {
  return (
    <>
      <NodeListPanel
        activeCollapsedNodeIds={props.activeCollapsedNodeIds}
        activeNodeId={props.activeNodeId}
        activeRows={props.activeRows}
        collapse={props.collapse}
        contextMenu={props.contextMenu}
        createRootNode={props.createRootNode}
        deleteNodesPermanently={props.deleteNodesPermanently}
        deleteStatusLabel={props.deleteStatusLabel}
        isTrashViewOpen={props.isTrashViewOpen}
        moveNodes={props.moveNodes}
        nodesById={props.nodesById}
        noteRowIds={props.state.noteRowIds}
        onOpenNotesView={props.onOpenNotesView}
        onRenameNode={props.updateNodeTitle}
        onSelect={props.onSelect}
        reviewSession={props.reviewSession}
        rowSpacing={props.rowSpacing}
        selectedNodeIds={props.selectedNodeIds}
        selectedTrashNodeId={props.selectedTrashNodeId}
        trashRowIds={props.state.trashRowIds}
        trashRowsLength={props.state.trashRows.length}
      />
      <NodeListTreeMenu {...props} />
    </>
  );
}

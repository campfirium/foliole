import type { ReviewSessionState } from '../../../store/workspaceStore';
import type { NodeTreeRow } from '../model/nodeTree';
import type { Node } from '../model/nodeTypes';

import { NodeListContextMenu } from './NodeListContextMenu';
import { hasRelearnTargets } from './nodeListContextMenuReview';
import { NodeListHeader } from './NodeListHeader';
import { useNodeListDragController } from './NodeListTreeDrag';
import type {
  NodeListCollapseController,
  NodeListContextMenuController
} from './NodeListTreeHooks';
import { NodeListRows } from './NodeListTreeRows';
import type { NodeListState, NodeSelectModifiers } from './NodeListTreeState';

interface NodeListPanelProps {
  activeCollapsedNodeIds: ReadonlySet<string>;
  activeNodeId: string | null;
  activeRows: NodeTreeRow[];
  collapse: NodeListCollapseController;
  contextMenu: NodeListContextMenuController;
  createRootNode: (content?: string) => string;
  deleteNodePermanently: (nodeId: string) => void;
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
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
  trashRowIds: string[];
  trashRowsLength: number;
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
        onEmptyTrash={() => (
          props.trashRowIds.forEach((id) => props.deleteNodePermanently(id)),
          props.contextMenu.closeContextMenu()
        )}
        onExpandAll={props.collapse.expandAllNotes}
        onOpenNotesView={props.onOpenNotesView}
        trashCount={props.trashRowsLength}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-4 py-2">
        <section
          aria-multiselectable="true"
          aria-label={props.isTrashViewOpen ? 'Trash section' : undefined}
          className="flex flex-1 flex-col gap-2"
          role="tree"
          onDoubleClick={(event) => event.target === event.currentTarget && props.createRootNode('')}
          onDragOver={(event) => event.target === event.currentTarget && drag.onDragOverRoot(event)}
          onDrop={(event) => event.target === event.currentTarget && drag.onDropRoot(event)}
        >
          {drag.isRootDropActive ? (
            <div
              aria-hidden="true"
              className="rounded border border-dashed border-border-strong bg-foreground/[0.04] px-3 py-2 text-xs text-foreground/70"
            >
              Drop to move node to root
            </div>
          ) : null}
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
            rows={props.activeRows}
            reviewSession={props.reviewSession}
            selectedNodeIds={props.selectedNodeIds}
            selectedTrashNodeId={props.selectedTrashNodeId}
          />
        </section>
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
  deleteNode: (nodeId: string) => void;
  deleteNodePermanently: (nodeId: string) => void;
  isTrashViewOpen: boolean;
  moveNodes: (nodeIds: string[], targetNodeId: string | null, intent: 'before' | 'after' | 'child' | 'root') => boolean; nodesById: Record<string, Node>;
  onOpenNotesView: () => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  reviewSession: ReviewSessionState;
  relearnNode: (nodeId: string, now?: string) => boolean;
  updateNodeTitle: (nodeId: string, title: string) => void;
  restoreNode: (nodeId: string) => void;
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
  state: NodeListState;
}

function confirmRelearnNodeReset(targetCount: number) {
  return window.confirm(
    targetCount > 1
      ? 'Reset review state and requeue the selected nodes?'
      : 'Reset review state and requeue this node?'
  );
}

function createRelearnNodeAction(
  contextTargets: string[],
  relearnNode: (nodeId: string, now?: string) => boolean,
  closeContextMenu: () => void
) {
  return () => {
    if (!confirmRelearnNodeReset(contextTargets.length)) {
      closeContextMenu();
      return;
    }
    contextTargets.forEach((id) => relearnNode(id));
    closeContextMenu();
  };
}

export function NodeListTreeContent(props: NodeListTreeContentProps) {
  const contextTargets = props.contextMenu.getContextTargets();
  return (
    <>
      <NodeListPanel
        activeCollapsedNodeIds={props.activeCollapsedNodeIds}
        activeNodeId={props.activeNodeId}
        activeRows={props.activeRows}
        collapse={props.collapse}
        contextMenu={props.contextMenu}
        createRootNode={props.createRootNode}
        deleteNodePermanently={props.deleteNodePermanently}
        isTrashViewOpen={props.isTrashViewOpen}
        moveNodes={props.moveNodes}
        nodesById={props.nodesById}
        noteRowIds={props.state.noteRowIds}
        onOpenNotesView={props.onOpenNotesView}
        onRenameNode={props.updateNodeTitle}
        onSelect={props.onSelect}
        reviewSession={props.reviewSession}
        selectedNodeIds={props.selectedNodeIds}
        selectedTrashNodeId={props.selectedTrashNodeId}
        trashRowIds={props.state.trashRowIds}
        trashRowsLength={props.state.trashRows.length}
      />
      {props.contextMenu.menuPosition ? (
        <NodeListContextMenu
          isTrashMenu={props.contextMenu.contextMenuMode === 'trash'}
          left={props.contextMenu.menuPosition.left}
          onClose={props.contextMenu.closeContextMenu}
          onCreateChildNode={() => (
            props.contextMenu.contextMenuMode === 'notes' &&
            contextTargets[0] &&
            props.createChildNode(contextTargets[0], ''),
            props.contextMenu.closeContextMenu()
          )}
          onCreateNode={() => (props.createRootNode(''), props.contextMenu.closeContextMenu())}
          onDeleteNode={() => (
            contextTargets
              .sort((a, b) => props.state.noteRowIds.indexOf(a) - props.state.noteRowIds.indexOf(b))
              .forEach((id) => props.deleteNode(id)),
            props.contextMenu.closeContextMenu()
          )}
          onDeleteNodePermanently={() => (
            contextTargets.forEach((id) => props.deleteNodePermanently(id)),
            props.contextMenu.closeContextMenu()
          )}
          onRelearnNode={createRelearnNodeAction(contextTargets, props.relearnNode, props.contextMenu.closeContextMenu)}
          onRestoreNode={() => (
            contextTargets.forEach((id) => props.restoreNode(id)),
            props.contextMenu.closeContextMenu()
          )}
          showRelearnAction={props.contextMenu.contextMenuMode === 'notes' && hasRelearnTargets(contextTargets, props.nodesById)}
          top={props.contextMenu.menuPosition.top}
        />
      ) : null}
    </>
  );
}

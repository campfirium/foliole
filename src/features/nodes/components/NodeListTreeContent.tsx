import type { MouseEvent as ReactMouseEvent } from 'react';

import { AppEmptyState } from '../../../shared/ui';
import type { NodeTreeRow } from '../model/nodeTree';
import type { Node } from '../model/nodeTypes';

import { NodeListContextMenu } from './NodeListContextMenu';
import { NodeListHeader } from './NodeListHeader';
import { useNodeListDragController } from './NodeListTreeDrag';
import type {
  NodeListCollapseController,
  NodeListContextMenuController
} from './NodeListTreeHooks';
import { createNodeListRowKeydownHandler } from './NodeListTreeKeyboard';
import type { NodeListState, NodeSelectModifiers } from './NodeListTreeState';
import { NodeTreeRow as NodeTreeRowItem } from './NodeTreeRow';

interface NodeListRowsProps {
  activeNodeId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  drag: ReturnType<typeof useNodeListDragController>;
  isTrashViewOpen: boolean;
  nodesById: Record<string, Node>;
  onContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  onToggleCollapse: (nodeId: string) => void;
  rows: NodeTreeRow[];
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
}

function NodeListRows(props: NodeListRowsProps) {
  if (props.rows.length === 0) {
    return props.isTrashViewOpen ? (
      <AppEmptyState description="Deleted nodes will appear here." title="Trash is empty" />
    ) : (
      <AppEmptyState description="Create or import a node to start editing." title="No nodes" />
    );
  }

  const onRowKeyDown = createNodeListRowKeydownHandler({
    collapsedNodeIds: props.collapsedNodeIds,
    onSelect: (nodeId) => props.onSelect(nodeId),
    onToggleCollapse: props.onToggleCollapse,
    rows: props.rows
  });

  return props.rows.map((row) => (
    <NodeTreeRowItem
      depth={row.depth}
      hasChildren={row.hasChildren}
      isActive={
        (props.isTrashViewOpen ? props.selectedTrashNodeId : props.activeNodeId) === row.node.id
      }
      isCollapsed={props.collapsedNodeIds.has(row.node.id)}
      isDragDisabled={props.isTrashViewOpen || Boolean(props.nodesById[row.node.id]?.anchorLink)}
      isDropTarget={props.drag.dropTargetNodeId === row.node.id}
      dropIntent={props.drag.dropTargetNodeId === row.node.id ? props.drag.dropIntent : null}
      isSelected={props.selectedNodeIds.includes(row.node.id)}
      key={row.node.id}
      label={row.node.title}
      nodeId={row.node.id}
      onDragEnd={(event) => (event.preventDefault(), props.drag.onDragEnd())}
      onDragEnter={props.drag.onDragEnterNode}
      onDragOver={props.drag.onDragOverNode}
      onDragStart={props.drag.onDragStartNode}
      onDrop={props.drag.onDropOnNode}
      onKeyDown={onRowKeyDown}
      onContextMenu={props.onContextMenu}
      onSelect={props.onSelect}
      onToggleCollapse={props.onToggleCollapse}
    />
  ));
}

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
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
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
            onSelect={props.onSelect}
            onToggleCollapse={props.collapse.toggleCollapse}
            rows={props.activeRows}
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
  moveNodes: (
    nodeIds: string[],
    targetNodeId: string | null,
    intent: 'before' | 'after' | 'child' | 'root'
  ) => boolean;
  nodesById: Record<string, Node>;
  onOpenNotesView: () => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  restoreNode: (nodeId: string) => void;
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
  state: NodeListState;
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
        deleteNodePermanently={props.deleteNodePermanently}
        isTrashViewOpen={props.isTrashViewOpen}
        moveNodes={props.moveNodes}
        nodesById={props.nodesById}
        noteRowIds={props.state.noteRowIds}
        onOpenNotesView={props.onOpenNotesView}
        onSelect={props.onSelect}
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
            props.contextMenu.getContextTargets()[0] &&
            props.createChildNode(props.contextMenu.getContextTargets()[0], ''),
            props.contextMenu.closeContextMenu()
          )}
          onCreateNode={() => (props.createRootNode(''), props.contextMenu.closeContextMenu())}
          onDeleteNode={() => (
            props.contextMenu
              .getContextTargets()
              .sort((a, b) => props.state.noteRowIds.indexOf(a) - props.state.noteRowIds.indexOf(b))
              .forEach((id) => props.deleteNode(id)),
            props.contextMenu.closeContextMenu()
          )}
          onDeleteNodePermanently={() => (
            props.contextMenu.getContextTargets().forEach((id) => props.deleteNodePermanently(id)),
            props.contextMenu.closeContextMenu()
          )}
          onRestoreNode={() => (
            props.contextMenu.getContextTargets().forEach((id) => props.restoreNode(id)),
            props.contextMenu.closeContextMenu()
          )}
          top={props.contextMenu.menuPosition.top}
        />
      ) : null}
    </>
  );
}

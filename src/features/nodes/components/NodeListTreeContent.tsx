import type { MouseEvent as ReactMouseEvent } from 'react';

import { AppEmptyState } from '../../../shared/ui';
import type { NodeTreeRow } from '../model/nodeTree';

import { NodeListContextMenu } from './NodeListContextMenu';
import { NodeListHeader } from './NodeListHeader';
import type {
  NodeListCollapseController,
  NodeListContextMenuController
} from './NodeListTreeHooks';
import type { NodeListState } from './NodeListTreeState';
import { NodeTreeRow as NodeTreeRowItem } from './NodeTreeRow';

interface NodeListRowsProps {
  activeNodeId: string | null;
  collapsedNodeIds: ReadonlySet<string>;
  isTrashViewOpen: boolean;
  onContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onSelect: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
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

  return props.rows.map((row) => (
    <NodeTreeRowItem
      depth={row.depth}
      hasChildren={row.hasChildren}
      isActive={
        (props.isTrashViewOpen ? props.selectedTrashNodeId : props.activeNodeId) === row.node.id
      }
      isCollapsed={props.collapsedNodeIds.has(row.node.id)}
      isSelected={props.selectedNodeIds.includes(row.node.id)}
      key={row.node.id}
      label={row.node.title}
      nodeId={row.node.id}
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
  onOpenNotesView: () => void;
  onSelect: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  selectedNodeIds: string[];
  selectedTrashNodeId: string | null;
  trashRowIds: string[];
  trashRowsLength: number;
}

function NodeListPanel(props: NodeListPanelProps) {
  return (
    <aside
      aria-label="Node list panel"
      className="flex min-h-0 flex-1 flex-col bg-bg-panel text-foreground"
    >
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
          aria-label={props.isTrashViewOpen ? 'Trash section' : undefined}
          className="flex flex-1 flex-col gap-2"
        >
          <NodeListRows
            activeNodeId={props.activeNodeId}
            collapsedNodeIds={props.activeCollapsedNodeIds}
            isTrashViewOpen={props.isTrashViewOpen}
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
  createRootNode: (content?: string) => string;
  deleteNode: (nodeId: string) => void;
  deleteNodePermanently: (nodeId: string) => void;
  isTrashViewOpen: boolean;
  onOpenNotesView: () => void;
  onSelect: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
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

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { NodeTreeRow } from '../model/nodeTree';

function focusTreeItem(nodeId: string) {
  requestAnimationFrame(() => {
    const element = document.querySelector<HTMLElement>(`[data-node-id="${nodeId}"]`);
    element?.focus();
  });
}

function findParentRowNodeId(rows: NodeTreeRow[], index: number): string | null {
  const currentDepth = rows[index]?.depth ?? 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    if (rows[i].depth < currentDepth) {
      return rows[i].node.id;
    }
  }
  return null;
}

interface NodeListKeyboardInput {
  collapsedNodeIds: ReadonlySet<string>;
  onSelect: (nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  rows: NodeTreeRow[];
}

function selectAndFocus(nodeId: string, onSelect: (nodeId: string) => void) {
  onSelect(nodeId);
  focusTreeItem(nodeId);
}

function handleLinearNavigationKey(
  key: string,
  index: number,
  rows: NodeTreeRow[],
  onSelect: (nodeId: string) => void
): boolean {
  if (key === 'ArrowDown' && rows[index + 1]) {
    selectAndFocus(rows[index + 1].node.id, onSelect);
    return true;
  }
  if (key === 'ArrowUp' && rows[index - 1]) {
    selectAndFocus(rows[index - 1].node.id, onSelect);
    return true;
  }
  if (key === 'Home' && rows[0]) {
    selectAndFocus(rows[0].node.id, onSelect);
    return true;
  }
  if (key === 'End' && rows[rows.length - 1]) {
    selectAndFocus(rows[rows.length - 1].node.id, onSelect);
    return true;
  }
  return false;
}

function handleHierarchyNavigationKey(
  key: string,
  index: number,
  row: NodeTreeRow,
  rows: NodeTreeRow[],
  isCollapsed: boolean,
  onSelect: (nodeId: string) => void,
  onToggleCollapse: (nodeId: string) => void
): boolean {
  const nextRow = rows[index + 1];
  if (key === 'ArrowRight' && row.hasChildren) {
    if (isCollapsed) {
      onToggleCollapse(row.node.id);
      return true;
    }
    if (nextRow && nextRow.depth > row.depth) {
      selectAndFocus(nextRow.node.id, onSelect);
      return true;
    }
  }
  if (key === 'ArrowLeft') {
    if (row.hasChildren && !isCollapsed) {
      onToggleCollapse(row.node.id);
      return true;
    }
    const parentNodeId = findParentRowNodeId(rows, index);
    if (parentNodeId) {
      selectAndFocus(parentNodeId, onSelect);
      return true;
    }
  }
  return false;
}

export function createNodeListRowKeydownHandler({
  collapsedNodeIds,
  onSelect,
  onToggleCollapse,
  rows
}: NodeListKeyboardInput) {
  return (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const index = rows.findIndex((row) => row.node.id === nodeId);
    if (index < 0) return;

    const row = rows[index];
    const isCollapsed = collapsedNodeIds.has(nodeId);
    const linearHandled = handleLinearNavigationKey(event.key, index, rows, onSelect);
    const hierarchyHandled = handleHierarchyNavigationKey(
      event.key,
      index,
      row,
      rows,
      isCollapsed,
      onSelect,
      onToggleCollapse
    );
    if (linearHandled || hierarchyHandled) {
      event.preventDefault();
    }
  };
}

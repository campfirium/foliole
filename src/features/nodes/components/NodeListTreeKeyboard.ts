import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

function focusTreeItem(nodeId: string) {
  requestAnimationFrame(() => {
    const element = Array.from(document.querySelectorAll<HTMLElement>('[data-node-id]'))
      .find((candidate) => candidate.dataset.nodeId === nodeId);
    element?.focus();
  });
}

export interface TreeKeyboardRow {
  depth: number;
  hasChildren: boolean;
  id: string;
}

type NodeTreeKeyboardRow = {
  depth: number;
  hasChildren: boolean;
  node: { id: string };
};

type KeyboardRow = TreeKeyboardRow | NodeTreeKeyboardRow;

function getKeyboardRowId(row: KeyboardRow) {
  return 'id' in row ? row.id : row.node.id;
}

function findParentRowNodeId(rows: readonly KeyboardRow[], index: number): string | null {
  const currentDepth = rows[index]?.depth ?? 0;
  for (let i = index - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row && row.depth < currentDepth) {
      return getKeyboardRowId(row);
    }
  }
  return null;
}

interface NodeListKeyboardInput {
  collapsedNodeIds: ReadonlySet<string>;
  onTab?: (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => boolean;
  onSelect: (nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  rows: readonly KeyboardRow[];
}

function selectAndFocus(nodeId: string, onSelect: (nodeId: string) => void) {
  onSelect(nodeId);
  focusTreeItem(nodeId);
}

function handleLinearNavigationKey(
  key: string,
  index: number,
  rows: readonly KeyboardRow[],
  onSelect: (nodeId: string) => void
): boolean {
  const nextRow = rows[index + 1];
  const previousRow = rows[index - 1];
  const firstRow = rows[0];
  const lastRow = rows[rows.length - 1];
  if (key === 'ArrowDown' && nextRow) {
    selectAndFocus(getKeyboardRowId(nextRow), onSelect);
    return true;
  }
  if (key === 'ArrowUp' && previousRow) {
    selectAndFocus(getKeyboardRowId(previousRow), onSelect);
    return true;
  }
  if (key === 'Home' && firstRow) {
    selectAndFocus(getKeyboardRowId(firstRow), onSelect);
    return true;
  }
  if (key === 'End' && lastRow) {
    selectAndFocus(getKeyboardRowId(lastRow), onSelect);
    return true;
  }
  return false;
}

function handleHierarchyNavigationKey(
  key: string,
  index: number,
  row: KeyboardRow,
  rows: readonly KeyboardRow[],
  isCollapsed: boolean,
  onSelect: (nodeId: string) => void,
  onToggleCollapse: (nodeId: string) => void
): boolean {
  const nextRow = rows[index + 1];
  if (key === 'ArrowRight' && row.hasChildren) {
    if (isCollapsed) {
      onToggleCollapse(getKeyboardRowId(row));
      return true;
    }
    if (nextRow && nextRow.depth > row.depth) {
      selectAndFocus(getKeyboardRowId(nextRow), onSelect);
      return true;
    }
  }
  if (key === 'ArrowLeft') {
    if (row.hasChildren && !isCollapsed) {
      onToggleCollapse(getKeyboardRowId(row));
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
  onTab,
  onSelect,
  onToggleCollapse,
  rows
}: NodeListKeyboardInput) {
  return (nodeId: string, event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.defaultPrevented) return;
    const index = rows.findIndex((row) => getKeyboardRowId(row) === nodeId);
    if (index < 0) return;

    const row = rows[index];
    if (!row) return;
    if (event.key === 'Tab' && !event.shiftKey && onTab?.(nodeId, event)) {
      event.preventDefault();
      return;
    }
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

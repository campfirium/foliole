import { createEvent, fireEvent, screen } from '@testing-library/react';
import { useCallback, useState } from 'react';
import { vi } from 'vitest';

import { renderWithLocalization } from '../../../shared/localization/testLocalization';
import { createEmptyReviewSession } from '../../../store/workspaceReviewReading';
import { buildNodeTreeRows, buildVisibleNodeTreeRows } from '../model/nodeTree';
import type { WorkspaceListNodesById } from '../model/workspaceListNode';

import { useNodeListDragController } from './NodeListTreeDrag';
import { NodeListRows } from './NodeListTreeRows';

function folder(id: string, parentNodeId: string | null = null) {
  return { id, parentNodeId, title: id, kind: 'folder' as const, hasContent: false,
    hasReveal: false, review: null, createdAt: '2026-11-16', updatedAt: '2026-11-16' };
}

const directoryNodes = {
  Source: folder('Source'),
  Descendant: folder('Descendant', 'Source'),
  Target: folder('Target'),
  'Target child': folder('Target child', 'Target'),
  Other: folder('Other'),
  'Other child': folder('Other child', 'Other')
};

export const moveFolders = vi.fn(async () => true);

function FolderDragTree({ external = false }: { external?: boolean }) {
  const nodesById: WorkspaceListNodesById = external ? { External: folder('External') } : directoryNodes;
  const [collapsedNodeIds, setCollapsedNodeIds] = useState(new Set(['Target', 'Other']));
  const allRows = buildNodeTreeRows(Object.keys(nodesById), nodesById);
  const rows = buildVisibleNodeTreeRows(allRows, collapsedNodeIds);
  const drag = useNodeListDragController({ disableRootDrop: false, isTrashViewOpen: false,
    moveNodes: moveFolders, nodesById, noteRowIds: rows.map(row => row.node.id), selectedNodeIds: [] });
  const expand = useCallback((nodeId: string) => {
    setCollapsedNodeIds(previous => new Set([...previous].filter(id => id !== nodeId)));
  }, []);
  const toggle = (nodeId: string) => setCollapsedNodeIds(previous => {
    const next = new Set(previous);
    if (next.has(nodeId)) next.delete(nodeId);
    else next.add(nodeId);
    return next;
  });
  return <div role="tree" aria-label={external ? 'External tree' : 'Directory tree'}
    onDragOver={event => event.target === event.currentTarget && drag.onDragOverRoot(event)}
    onDrop={event => event.target === event.currentTarget && drag.onDropRoot(event)}>
    <NodeListRows activeNodeId={null} collapsedNodeIds={collapsedNodeIds} drag={drag}
      highlightedNodeId={null} isTrashViewOpen={false} isVirtualViewOpen={false} nodesById={nodesById}
      onContextMenu={vi.fn()} onExpandCollapse={expand} onRename={vi.fn()} onSelect={vi.fn()}
      onToggleCollapse={toggle} reviewSession={createEmptyReviewSession()} rows={rows} rowSpacing={0}
      scrollContainerRef={{ current: null }} scrollTargetNodeId={null} selectedNodeIds={[]}
      selectedTrashNodeId={null} virtualizeRows={false} />
  </div>;
}

export function renderFolderDrag(crossTree = false) {
  const view = renderWithLocalization(<><FolderDragTree />{crossTree && <FolderDragTree external />}</>);
  const data = new Map<string, string>();
  const transfer = { dropEffect: 'move', effectAllowed: 'copyMove',
    getData: (format: string) => data.get(format) ?? '',
    setData: (format: string, value: string) => data.set(format, value) };
  const row = (name: string) => screen.getByRole('treeitem', { name }).parentElement!;
  for (const name of ['Source', 'Target', 'Other', 'Descendant']) {
    row(name).getBoundingClientRect = () => ({ top: 0, bottom: 100, height: 100,
      left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: () => undefined });
  }
  const source = row(crossTree ? 'External' : 'Source');
  fireEvent.dragStart(source, { dataTransfer: transfer });
  const hover = (name = 'Target', clientY = 50) => {
    const target = row(name);
    const event = createEvent.dragOver(target, { dataTransfer: transfer });
    Object.defineProperty(event, 'clientY', { value: clientY });
    fireEvent(target, event);
  };
  return { ...view, row, source, transfer, hover };
}

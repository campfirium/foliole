import type { MouseEvent as ReactMouseEvent } from 'react';

import { Button, EmptyState } from '../../../shared/ui';
import type { NodeTreeRow as NodeTreeRowModel } from '../model/nodeTree';

import { NodeTreeRow } from './NodeTreeRow';

interface NodeTrashSectionProps {
  isOpen: boolean;
  onContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onEmptyTrash: () => void;
  onSelect: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  rows: NodeTreeRowModel[];
  selectedNodeIds: string[];
}

export function NodeTrashSection({ isOpen, onContextMenu, onEmptyTrash, onSelect, rows, selectedNodeIds }: NodeTrashSectionProps) {
  return (
    <section aria-hidden={!isOpen} aria-label="Trash section" className="trash-inline-section" data-open={isOpen}>
      <header className="trash-inline-header">
        <h3 className="trash-inline-title">Trash</h3>
        <Button aria-label="Empty Trash" disabled={rows.length === 0} onClick={onEmptyTrash} size="sm" variant="subtle">
          Empty Trash
        </Button>
      </header>
      {rows.length === 0 ? (
        <EmptyState description="Deleted nodes will appear here." title="Trash is empty" />
      ) : (
        rows.map((row) => (
          <NodeTreeRow
            depth={row.depth}
            isActive={false}
            isSelected={selectedNodeIds.includes(row.node.id)}
            key={row.node.id}
            label={row.node.title}
            nodeId={row.node.id}
            onContextMenu={onContextMenu}
            onSelect={onSelect}
            showBranch={row.depth > 0 || row.hasChildren}
          />
        ))
      )}
    </section>
  );
}

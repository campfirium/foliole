import type { MouseEvent as ReactMouseEvent } from 'react';

import { Button, EmptyState } from '../../../shared/ui';
import type { NodeTreeRow as NodeTreeRowModel } from '../model/nodeTree';

import { NodeTreeRow } from './NodeTreeRow';

interface NodeTrashSectionProps {
  isOpen: boolean;
  onOpen: () => void;
  onContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onEmptyTrash: () => void;
  onSelect: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  rows: NodeTreeRowModel[];
  selectedNodeIds: string[];
}

export function NodeTrashSection({
  isOpen,
  onOpen,
  onContextMenu,
  onEmptyTrash,
  onSelect,
  rows,
  selectedNodeIds
}: NodeTrashSectionProps) {
  const handleToggleTrash = () => {
    onOpen();
  };

  const handleToggleTrashButton = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpen();
  };

  const handleEmptyTrash = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onEmptyTrash();
  };

  return (
    <section aria-label="Trash section" className="trash-inline-section" data-open={isOpen}>
      <header className="trash-inline-header" onClick={handleToggleTrash}>
        <button
          aria-label="Trash"
          aria-pressed={isOpen}
          className="trash-inline-toggle"
          onClick={handleToggleTrashButton}
          type="button"
        >
          Trash
        </button>
        {isOpen ? (
          <Button aria-label="Empty" disabled={rows.length === 0} onClick={handleEmptyTrash} size="sm" variant="subtle">
            Empty
          </Button>
        ) : null}
      </header>
      <div aria-hidden={!isOpen} className="trash-inline-content">
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
      </div>
    </section>
  );
}

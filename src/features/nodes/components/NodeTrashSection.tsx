import type { MouseEvent as ReactMouseEvent } from 'react';

import { AppButton, EmptyState } from '../../../shared/ui';
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
    <section aria-label="Trash section" className="-mx-4 mt-auto flex flex-none flex-col data-[open=true]:mt-0" data-open={isOpen}>
      <header
        className="flex min-h-[52px] cursor-pointer items-center justify-between border-y border-dashed border-border px-4 py-3 transition-colors hover:bg-amber-100/40 data-[open=false]:border-b-0"
        data-open={isOpen}
        onClick={handleToggleTrash}
      >
        <button
          aria-label="Trash"
          aria-pressed={isOpen}
          className="min-h-7 border-0 bg-transparent p-0 text-left text-xs font-bold uppercase tracking-[0.08em] text-stone-500 hover:text-foreground aria-[pressed=true]:text-foreground"
          onClick={handleToggleTrashButton}
          type="button"
        >
          Trash
        </button>
        {isOpen ? (
          <AppButton aria-label="Empty" disabled={rows.length === 0} onClick={handleEmptyTrash} size="sm" variant="subtle">
            Empty
          </AppButton>
        ) : null}
      </header>
      <div
        aria-hidden={!isOpen}
        className="pointer-events-none flex max-h-0 flex-col gap-2 overflow-hidden px-4 pt-0 opacity-0 transition-all duration-200 data-[open=true]:pointer-events-auto data-[open=true]:max-h-[52dvh] data-[open=true]:pt-2 data-[open=true]:opacity-100"
        data-open={isOpen}
      >
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

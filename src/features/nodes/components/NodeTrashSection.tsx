import type { MouseEvent as ReactMouseEvent } from 'react';

import { AppButton, AppEmptyState } from '../../../shared/ui';
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

export function NodeTrashSection({
  isOpen,
  onContextMenu,
  onEmptyTrash,
  onSelect,
  rows,
  selectedNodeIds
}: NodeTrashSectionProps) {
  const handleEmptyTrash = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onEmptyTrash();
  };

  return (
    <section aria-label="Trash section" className="-mx-4 mt-auto flex flex-none flex-col data-[open=true]:mt-0" data-open={isOpen}>
      {isOpen ? (
        <div className="flex min-h-[48px] items-center justify-between px-4 pt-2">
          <span className="text-sm font-semibold uppercase tracking-[0.06em] text-foreground/70">Trash</span>
          <AppButton aria-label="Empty" disabled={rows.length === 0} onClick={handleEmptyTrash} size="sm" variant="subtle">
            Empty
          </AppButton>
        </div>
      ) : null}
      <div
        aria-hidden={!isOpen}
        className="pointer-events-none flex max-h-0 flex-col gap-2 overflow-hidden px-4 pt-0 opacity-0 transition-all duration-200 data-[open=true]:pointer-events-auto data-[open=true]:max-h-[52dvh] data-[open=true]:pt-2 data-[open=true]:opacity-100"
        data-open={isOpen}
      >
        {rows.length === 0 ? (
          <AppEmptyState description="Deleted nodes will appear here." title="Trash is empty" />
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

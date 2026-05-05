import type { MouseEvent as ReactMouseEvent } from 'react';

import { AppButton, AppEmptyState } from '../../../shared/ui';
import type { NodeTreeRow as NodeTreeRowModel } from '../model/nodeTree';

import { getNodeListRowSpacing } from './nodeListRowSpacingSettings';
import type { NodeSelectModifiers } from './NodeListTreeState';
import { NodeTreeRow } from './NodeTreeRow';

const NOOP_TOGGLE_COLLAPSE = () => undefined;

interface NodeTrashSectionProps {
  isOpen: boolean;
  onContextMenu: (nodeId: string, event: ReactMouseEvent<HTMLButtonElement>) => void;
  onEmptyTrash: () => void;
  onSelect: (nodeId: string, modifiers?: NodeSelectModifiers) => void;
  rows: NodeTreeRowModel[];
  selectedNodeIds: string[];
}

function EmptyTrashButton({
  disabled,
  onEmptyTrash
}: {
  disabled: boolean;
  onEmptyTrash: () => void;
}) {
  return (
    <AppButton
      aria-label="Empty"
      disabled={disabled}
      onClick={(event) => (event.stopPropagation(), onEmptyTrash())}
      size="sm"
      variant="subtle"
    >
      Empty
    </AppButton>
  );
}

export function NodeTrashSection({
  isOpen,
  onContextMenu,
  onEmptyTrash,
  onSelect,
  rows,
  selectedNodeIds
}: NodeTrashSectionProps) {
  const rowSpacing = getNodeListRowSpacing();

  return (
    <section
      aria-label="Trash section"
      className="-mx-4 mt-auto flex flex-none flex-col data-[open=true]:mt-0"
      data-open={isOpen}
    >
      {isOpen ? (
        <div className="flex min-h-[48px] items-center justify-between px-4 pt-2">
          <span className="text-sm font-semibold uppercase tracking-[0.06em] text-foreground/70">
            Trash
          </span>
          <EmptyTrashButton disabled={rows.length === 0} onEmptyTrash={onEmptyTrash} />
        </div>
      ) : null}
      <div
        aria-hidden={!isOpen}
        className="pointer-events-none flex max-h-0 flex-col gap-2 overflow-hidden px-4 pt-0 opacity-0 transition-all duration-200 data-[open=true]:pointer-events-auto data-[open=true]:max-h-[52dvh] data-[open=true]:pt-2 data-[open=true]:opacity-100"
        data-open={isOpen}
      >
        {rows.length === 0 ? (
          <AppEmptyState description="Deleted topics will appear here." title="Trash is empty" />
        ) : (
          rows.map((row) => (
            <NodeTreeRow
              descendantCount={row.descendantCount}
              depth={row.depth}
              hasChildren={row.hasChildren}
              isActive={false}
              isCollapsed={false}
              isSelected={selectedNodeIds.includes(row.node.id)}
              key={row.node.id}
              label={row.node.title}
              nodeId={row.node.id}
              rowSpacing={rowSpacing}
              showIcon={false}
              onContextMenu={onContextMenu}
              onSelect={onSelect}
              onToggleCollapse={NOOP_TOGGLE_COLLAPSE}
            />
          ))
        )}
      </div>
    </section>
  );
}

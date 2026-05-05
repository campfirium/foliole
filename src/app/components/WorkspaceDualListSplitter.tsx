import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '../../shared/lib/utils';

interface WorkspaceDualListSplitterProps {
  isResizing: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  width: number;
}

export function WorkspaceDualListSplitter({
  isResizing,
  onKeyDown,
  onPointerDown,
  width
}: WorkspaceDualListSplitterProps) {
  return (
    <div
      aria-label="Resize folder list"
      aria-orientation="vertical"
      aria-valuenow={Math.round(width)}
      className="group relative w-px self-stretch bg-transparent"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      role="separator"
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 cursor-col-resize',
          'before:absolute before:inset-y-0 before:left-1/2 before:w-px before:-translate-x-1/2 before:bg-border',
          isResizing && 'before:bg-border-strong'
        )}
      />
    </div>
  );
}

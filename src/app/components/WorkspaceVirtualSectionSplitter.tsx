import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '../../shared/lib/utils';

interface WorkspaceVirtualSectionSplitterProps {
  height: number;
  isResizing: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function WorkspaceVirtualSectionSplitter({
  height,
  isResizing,
  onKeyDown,
  onPointerDown
}: WorkspaceVirtualSectionSplitterProps) {
  return (
    <div
      aria-label="Resize virtual section"
      aria-orientation="horizontal"
      aria-valuenow={Math.round(height)}
      className="group relative bg-transparent"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      role="separator"
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 cursor-row-resize',
          'before:absolute before:left-0 before:right-0 before:top-1/2 before:h-px before:-translate-y-1/2 before:bg-border',
          isResizing && 'before:bg-border-strong'
        )}
      />
    </div>
  );
}

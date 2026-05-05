import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '../../shared/lib/utils';

interface WorkspaceExternalSectionSplitterProps {
  height: number;
  isResizing: boolean;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function WorkspaceExternalSectionSplitter({
  height,
  isResizing,
  onKeyDown,
  onPointerDown
}: WorkspaceExternalSectionSplitterProps) {
  return (
    <div
      aria-label="Resize external section"
      aria-orientation="horizontal"
      aria-valuenow={Math.round(height)}
      className="group relative h-1 shrink-0 bg-transparent"
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      role="separator"
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-x-0 bottom-0 h-1 cursor-row-resize',
          'before:absolute before:bottom-0 before:left-4 before:right-4 before:h-px before:bg-divider/45',
          isResizing && 'before:bg-border-strong'
        )}
      />
    </div>
  );
}

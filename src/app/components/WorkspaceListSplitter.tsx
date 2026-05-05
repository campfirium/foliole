import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '../../shared/lib/utils';

export interface WorkspaceListSplitterProps {
  isCollapsed: boolean;
  isResizingList: boolean;
  listWidth: number;
  onResetLayout: () => void;
  onSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function WorkspaceListSplitter({
  isCollapsed,
  isResizingList,
  listWidth,
  onResetLayout,
  onSplitterKeyDown,
  onSplitterPointerDown
}: WorkspaceListSplitterProps) {
  return (
    <div
      aria-label="Resize topic list"
      aria-orientation="vertical"
      aria-valuenow={Math.round(listWidth)}
      className={cn('group relative z-10 self-stretch bg-transparent max-[1080px]:hidden', isCollapsed && 'pointer-events-none opacity-0')}
      onDoubleClick={onResetLayout}
      onKeyDown={onSplitterKeyDown}
      onPointerDown={onSplitterPointerDown}
      role="separator"
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 cursor-col-resize"
      />
      {isResizingList ? <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-px bg-border-strong" /> : null}
    </div>
  );
}

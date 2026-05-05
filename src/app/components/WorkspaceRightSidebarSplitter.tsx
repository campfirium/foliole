import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '../../shared/lib/utils';

interface WorkspaceRightSidebarSplitterProps {
  isResizingRightSidebar: boolean;
  onResetLayout: () => void;
  onRightSidebarSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRightSidebarSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  rightSidebarWidth: number;
}

export function WorkspaceRightSidebarSplitter({
  isResizingRightSidebar,
  onResetLayout,
  onRightSidebarSplitterKeyDown,
  onRightSidebarSplitterPointerDown,
  rightSidebarWidth
}: WorkspaceRightSidebarSplitterProps) {
  return (
    <div
      aria-label="Resize inspector sidebar"
      aria-orientation="vertical"
      aria-valuenow={Math.round(rightSidebarWidth)}
      className={cn('group relative self-stretch bg-transparent max-xl:hidden')}
      onDoubleClick={onResetLayout}
      onKeyDown={onRightSidebarSplitterKeyDown}
      onPointerDown={onRightSidebarSplitterPointerDown}
      role="separator"
      tabIndex={0}
    >
      <span aria-hidden="true" className="absolute inset-y-0 -right-1 w-3 cursor-col-resize" />
      {isResizingRightSidebar ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-px bg-border-strong" />
      ) : null}
    </div>
  );
}

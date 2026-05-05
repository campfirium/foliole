import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '../../lib/utils';

interface WorkspaceListSplitterProps {
  isResizingList: boolean;
  listWidth: number;
  onResetLayout: () => void;
  onSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function WorkspaceListSplitter({
  isResizingList,
  listWidth,
  onResetLayout,
  onSplitterKeyDown,
  onSplitterPointerDown
}: WorkspaceListSplitterProps) {
  return (
    <div
      aria-label="Resize node list"
      aria-orientation="vertical"
      aria-valuenow={Math.round(listWidth)}
      className={cn('group relative self-stretch bg-transparent max-[1080px]:hidden')}
      onDoubleClick={onResetLayout}
      onKeyDown={onSplitterKeyDown}
      onPointerDown={onSplitterPointerDown}
      role="separator"
      tabIndex={0}
    >
      <span aria-hidden="true" className="absolute inset-y-0 -left-1 w-3 cursor-col-resize" />
      {isResizingList ? <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-px bg-border-strong" /> : null}
    </div>
  );
}

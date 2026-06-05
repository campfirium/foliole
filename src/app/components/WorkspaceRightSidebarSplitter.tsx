import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

export interface WorkspaceRightSidebarSplitterProps {
  isCollapsed: boolean;
  isResizingRightSidebar: boolean;
  onResetLayout: () => void;
  onRightSidebarSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onRightSidebarSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  rightSidebarWidth: number;
}

export function WorkspaceRightSidebarSplitter({
  isCollapsed,
  isResizingRightSidebar,
  onResetLayout,
  onRightSidebarSplitterKeyDown,
  onRightSidebarSplitterPointerDown,
  rightSidebarWidth
}: WorkspaceRightSidebarSplitterProps) {
  const t = useTranslation();
  return (
    <div
      aria-label={t('desktop.workspace.resizeInspectorSidebar')}
      aria-orientation="vertical"
      aria-valuenow={Math.round(rightSidebarWidth)}
      className={cn('group relative z-surface self-stretch bg-transparent max-xl:hidden', isCollapsed && 'pointer-events-none opacity-0')}
      onDoubleClick={onResetLayout}
      onKeyDown={onRightSidebarSplitterKeyDown}
      onPointerDown={onRightSidebarSplitterPointerDown}
      role="separator"
      tabIndex={0}
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-3 -translate-x-1/2 cursor-col-resize" />
      {isResizingRightSidebar ? (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-px bg-border-strong" />
      ) : null}
    </div>
  );
}

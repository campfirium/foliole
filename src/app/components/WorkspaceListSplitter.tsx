import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

import { cn } from '../../shared/lib/utils';
import { useTranslation } from '../../shared/localization/LocalizationProvider';

export interface WorkspaceListSplitterProps {
  floating?: boolean;
  isCollapsed: boolean;
  isResizingList: boolean;
  listWidth: number;
  onResetLayout: () => void;
  onSplitterKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  onSplitterPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

export function WorkspaceListSplitter({
  floating,
  isCollapsed,
  isResizingList,
  listWidth,
  onResetLayout,
  onSplitterKeyDown,
  onSplitterPointerDown
}: WorkspaceListSplitterProps) {
  const t = useTranslation();
  return (
    <div
      aria-label={t('desktop.workspace.resizeTopicList')}
      aria-orientation="vertical"
      data-workspace-floating-splitter={floating ? 'left' : undefined}
      aria-valuenow={Math.round(listWidth)}
      className={cn('app-focus-divider group relative z-surface self-stretch bg-transparent max-[1080px]:hidden', isCollapsed && 'pointer-events-none opacity-0')}
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

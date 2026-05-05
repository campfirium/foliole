import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

interface ReviewActionBarProps {
  ariaLabel?: string;
  className?: string;
  mode?: 'study' | 'edit';
  primary: ReactNode;
  reviewInputMode?: 'editing' | 'hotkeys';
  reviewItemKind?: 'fsrs' | 'reading';
  secondary?: ReactNode;
}

export function ReviewActionBar({
  ariaLabel,
  className,
  mode,
  primary,
  reviewInputMode,
  reviewItemKind,
  secondary
}: ReviewActionBarProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn('flex h-[var(--workspace-bottom-toolbar-height)] w-full flex-none items-center border-t border-border bg-bg-elevated px-4', className)}
      data-mode={mode}
      data-review-input-mode={reviewInputMode}
      data-review-item-kind={reviewItemKind}
      role="group"
    >
      <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div className="min-w-0 truncate text-[13px] font-medium text-companion-text-secondary">{secondary}</div>
        <div className="flex items-center justify-center">{primary}</div>
        <div aria-hidden="true" className="min-w-0" />
      </div>
    </div>
  );
}

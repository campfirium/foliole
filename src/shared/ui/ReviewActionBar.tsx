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
  status?: ReactNode;
}

export function ReviewActionBar({
  ariaLabel,
  className,
  mode,
  primary,
  reviewInputMode,
  reviewItemKind,
  secondary,
  status
}: ReviewActionBarProps) {
  return (
    <div
      aria-label={ariaLabel}
      className={cn('flex min-h-[56px] w-full flex-none flex-col justify-center gap-1 border-t border-border bg-bg-elevated px-4 py-1', className)}
      data-mode={mode}
      data-review-input-mode={reviewInputMode}
      data-review-item-kind={reviewItemKind}
      role="group"
    >
      <div className="grid min-h-[32px] w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div className="min-w-0 text-sm text-foreground/65">{secondary}</div>
        <div className="flex items-center justify-center">{primary}</div>
        <div aria-hidden="true" className="min-w-0" />
      </div>
      {status ? <div className="flex items-center justify-center text-center">{status}</div> : null}
    </div>
  );
}

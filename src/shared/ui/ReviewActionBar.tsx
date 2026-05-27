import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

interface ReviewActionBarProps {
  ariaLabel?: string;
  className?: string;
  mode?: 'study' | 'edit';
  primary: ReactNode;
  progress?: ReactNode;
  reviewInputMode?: 'editing' | 'hotkeys';
  reviewItemKind?: 'fsrs' | 'reading';
  secondary?: ReactNode;
  surface?: 'panel' | 'overlay';
  style?: CSSProperties;
}

export function ReviewActionBar({
  ariaLabel,
  className,
  mode,
  primary,
  progress,
  reviewInputMode,
  reviewItemKind,
  secondary,
  surface = 'panel',
  style
}: ReviewActionBarProps) {
  const mergedStyle =
    surface === 'panel'
      ? ({
          ...style,
          borderTopColor: 'rgb(var(--color-border) / var(--workspace-divider-opacity))'
        } as CSSProperties)
      : style;

  return (
    <div
      aria-label={ariaLabel}
      className={cn(
        'relative flex h-[var(--workspace-bottom-toolbar-height)] flex-none items-center px-4',
        surface === 'panel' && 'w-full border-t border-border bg-bg-elevated',
        surface === 'overlay' &&
          'mx-auto w-fit max-w-[calc(100vw-3rem)] rounded-lg bg-[rgb(var(--color-bg-elevated)/0.6)] shadow-popover',
        className
      )}
      data-surface={surface}
      data-mode={mode}
      data-review-input-mode={reviewInputMode}
      data-review-item-kind={reviewItemKind}
      role="group"
      style={mergedStyle}
    >
      {progress}
      {surface === 'overlay' ? (
        <div className="flex items-center justify-center">{primary}</div>
      ) : (
        <div className="grid w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
          <div className="min-w-0 truncate text-[13px] font-medium text-muted-foreground">{secondary}</div>
          <div className="flex items-center justify-center">{primary}</div>
          <div aria-hidden="true" className="min-w-0" />
        </div>
      )}
    </div>
  );
}

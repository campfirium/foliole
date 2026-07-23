import { forwardRef, Fragment, type ReactNode } from 'react';

import { AppSpinner } from './EmptyState';

import { cn } from '@/shared/lib/utils';

const overlayButtonClass =
  'relative inline-flex min-h-9 min-w-20 shrink-0 appearance-none items-center justify-center rounded-none border-0 bg-transparent px-5 text-ui-md text-foreground/82 shadow-none transition-colors hover:bg-transparent hover:text-foreground focus:outline-none focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border-strong disabled:pointer-events-none disabled:opacity-45';

export const ReviewOverlayActionButton = forwardRef<HTMLButtonElement, {
  ariaLabel?: string;
  className?: string;
  disabled?: boolean;
  label: string;
  loading?: boolean;
  onClick: () => void;
  title?: string | undefined;
}>(function ReviewOverlayActionButton(props, ref) {
  return (
    <button
      aria-label={props.ariaLabel ?? props.label}
      aria-busy={props.loading || undefined}
      className={cn(overlayButtonClass, props.loading && 'disabled:opacity-100', props.className)}
      disabled={props.disabled || props.loading}
      onClick={props.onClick}
      ref={ref}
      style={{ background: 'transparent', border: 0, borderRadius: 0, boxShadow: 'none' }}
      title={props.title}
      type="button"
    >
      {props.loading ? <AppSpinner className="pointer-events-none absolute left-2" decorative size="sm" /> : null}
      <span className={props.loading ? 'translate-x-2' : undefined}>{props.label}</span>
    </button>
  );
});

export function ReviewOverlayDivider() {
  return <span aria-hidden="true" className="h-4 w-px shrink-0 bg-[rgb(var(--color-border)/0.42)]" data-review-overlay-divider />;
}

export function renderOverlayDividedActions(items: ReadonlyArray<{ key: string; node: ReactNode }>, surface: 'panel' | 'overlay') {
  return items.map((item, index) => (
    <Fragment key={item.key}>
      {index > 0 && surface === 'overlay' ? <ReviewOverlayDivider /> : null}
      {item.node}
    </Fragment>
  ));
}

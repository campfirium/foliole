import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

interface InspectorSectionProps {
  actions?: ReactNode;
  ariaLabel?: string;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  description?: ReactNode;
  title: string;
}

export function InspectorSection({
  actions,
  ariaLabel,
  children,
  className,
  contentClassName,
  description,
  title
}: InspectorSectionProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        'rounded-lg border border-border bg-[var(--app-inspector-section-bg)] p-4 shadow-inspector-section',
        className
      )}
    >
      <div className={cn('flex items-start justify-between gap-3', (description || children) && 'mb-3')}>
        <div className="min-w-0">
          <h3 className="text-ui-md font-semibold text-foreground">{title}</h3>
          {description ? <p className="mt-1 text-ui-md text-foreground/65">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children ? <div className={cn('min-w-0', contentClassName)}>{children}</div> : null}
    </section>
  );
}

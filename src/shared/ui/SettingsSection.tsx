import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

export interface SettingsSectionProps {
  actions?: ReactNode;
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  description?: string;
  title?: string;
}

export function SettingsSection({
  actions,
  ariaLabel,
  children,
  className,
  description,
  title
}: SettingsSectionProps) {
  const hasHeader = Boolean(title || description || actions);

  return (
    <section aria-label={ariaLabel} className={cn('mb-8 space-y-3 last:mb-0', className)}>
      {hasHeader ? (
        <div className="flex items-start justify-between gap-4 px-5">
          <div className="min-w-0">
            {title ? <h3 className="text-[0.95rem] font-semibold text-foreground">{title}</h3> : null}
            {description ? <p className="mt-1 max-w-[760px] text-sm leading-6 text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div
        className={cn(
          'overflow-hidden rounded-md bg-settings-group',
          '[&>[data-settings-row]+[data-settings-row]]:before:block'
        )}
      >
        {children}
      </div>
    </section>
  );
}

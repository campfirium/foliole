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
    <section aria-label={ariaLabel} className={cn('mb-8 last:mb-0', className)}>
      {hasHeader ? (
        <div className="px-5">
          <div className="flex items-start justify-between gap-4 border-b border-settings-divider/55 pb-3">
            <div className="min-w-0">
              {title ? <h3 className="text-[0.95rem] font-semibold text-foreground">{title}</h3> : null}
              {description ? <p className="mt-1 max-w-[760px] text-sm leading-6 text-muted-foreground">{description}</p> : null}
            </div>
            {actions ? <div className="shrink-0">{actions}</div> : null}
          </div>
        </div>
      ) : null}
      <div
        className={cn(
          'overflow-hidden',
          '[&>[data-settings-row]+[data-settings-row]]:before:block'
        )}
      >
        {children}
      </div>
    </section>
  );
}

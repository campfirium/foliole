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
    <section
      aria-label={ariaLabel}
      className={cn(
        'relative mb-8 pt-7 before:absolute before:left-settings-panel-x before:right-settings-panel-x before:top-0 before:border-t before:border-settings-divider/70 first:pt-0 first:before:hidden last:mb-0',
        className
      )}
    >
      {hasHeader ? (
        <div className="px-settings-panel-x pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {title ? <h3 className="text-ui-lg font-semibold text-foreground">{title}</h3> : null}
              {description ? <p className="mt-1 max-w-[760px] text-ui-md leading-6 text-muted-foreground">{description}</p> : null}
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

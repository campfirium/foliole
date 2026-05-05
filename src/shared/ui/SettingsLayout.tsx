import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

interface SettingsSectionProps {
  actions?: ReactNode;
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  description?: string;
  title: string;
}

interface SettingsRowProps {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  readonly?: boolean;
  title: string;
}

export function SettingsSection({
  actions,
  ariaLabel,
  children,
  className,
  description,
  title
}: SettingsSectionProps) {
  return (
    <section aria-label={ariaLabel} className={cn('mb-5 space-y-2.5 last:mb-0', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {description ? <p className="mt-1 text-sm text-foreground/60">{description}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function SettingsRow({ children, className, description, readonly = false, title }: SettingsRowProps) {
  return (
    <div
      className={cn(
        'flex min-h-[70px] items-center justify-between gap-3 rounded-lg border px-3 py-2.5 max-[1080px]:flex-col max-[1080px]:items-start',
        readonly ? 'border-border/80 bg-bg-elevated' : 'border-border bg-bg-panel',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <h4 className="text-[0.95rem] font-semibold text-foreground">{title}</h4>
        {description ? <p className="mt-0.5 text-sm text-foreground/65">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsControlSlot({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('inline-flex max-w-full flex-[0_0_360px] items-center gap-2 max-[1080px]:w-full max-[1080px]:flex-auto', className)}>
      {children}
    </div>
  );
}

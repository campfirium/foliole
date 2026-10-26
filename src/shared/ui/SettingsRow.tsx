import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

export interface SettingsRowProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  detail?: { label: string; value: ReactNode };
  readonly?: boolean;
  title?: string;
}

export function SettingsRow({
  children,
  className,
  description,
  detail,
  readonly = false,
  title,
  ...rest
}: SettingsRowProps) {
  const hasCopy = Boolean(title || description || detail);

  return (
    <div
      className={cn(
        'relative flex min-h-settings-row items-start justify-between gap-6 px-settings-panel-x py-settings-panel-y before:absolute before:left-settings-panel-x before:right-settings-panel-x before:top-0 before:hidden before:border-t before:border-settings-divider/70 first:before:hidden max-[1080px]:flex-col max-[1080px]:items-start',
        readonly && 'text-foreground/80',
        className
      )}
      data-settings-row
      {...rest}
    >
      {hasCopy ? (
        <div className="min-w-0 flex-1">
          {title ? <h4 className="text-ui-lg font-normal text-foreground">{title}</h4> : null}
          {description ? <p className="mt-0.5 max-w-[780px] text-ui-md leading-6 text-foreground/64">{description}</p> : null}
          {detail ? <div className="mt-3 flex items-baseline justify-between gap-6 text-ui-md leading-6 text-foreground/64">
            <span className="shrink-0">{detail.label}</span>
            <span className="min-w-0 text-right">{detail.value}</span>
          </div> : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

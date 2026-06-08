import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';

export interface SettingsRowProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  readonly?: boolean;
  title: string;
}

export function SettingsRow({
  children,
  className,
  description,
  readonly = false,
  title,
  ...rest
}: SettingsRowProps) {
  return (
    <div
      className={cn(
        'relative flex min-h-[82px] items-start justify-between gap-6 px-5 py-5 before:absolute before:left-5 before:right-5 before:top-0 before:hidden before:border-t before:border-settings-divider/70 first:before:hidden max-[1080px]:flex-col max-[1080px]:items-start',
        readonly && 'text-foreground/80',
        className
      )}
      data-settings-row
      {...rest}
    >
      <div className="min-w-0 flex-1">
        <h4 className="text-ui-lg font-normal text-foreground">{title}</h4>
        {description ? <p className="mt-0.5 max-w-[780px] text-ui-md leading-6 text-foreground/64">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

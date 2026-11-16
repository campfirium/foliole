import type { ComponentProps, ReactElement, ReactNode } from 'react';

import { AppIconButton, AppTooltip, AppTooltipContent, AppTooltipTrigger } from '../../shared/ui';

export function PdfToolbarTooltip({ children, disabled = false, label }: {
  children: ReactElement;
  disabled?: boolean;
  label: ReactNode;
}) {
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        {disabled ? <span className="inline-flex shrink-0">{children}</span> : children}
      </AppTooltipTrigger>
      <AppTooltipContent>{label}</AppTooltipContent>
    </AppTooltip>
  );
}

export function PdfToolbarIconButton(props: ComponentProps<typeof AppIconButton>) {
  return (
    <PdfToolbarTooltip disabled={props.disabled ?? false} label={props.label}>
      <AppIconButton {...props} />
    </PdfToolbarTooltip>
  );
}

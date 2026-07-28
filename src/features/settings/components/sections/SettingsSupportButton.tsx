import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger,
  settingsButtonClassName
} from '../../../../shared/ui';

export function SettingsSupportButton(props: {
  ariaLabel?: string | undefined;
  children: ReactNode;
  className?: string;
  commandId?: string | undefined;
  icon?: LucideIcon | undefined;
  onRunSupportCommand?: ((commandId: string) => void) | undefined;
  onRunStart?: (() => void) | undefined;
  onRunAction?: (() => void) | undefined;
  tooltip?: string | undefined;
}) {
  const Icon = props.icon;
  const canRun = Boolean(props.onRunAction || (props.commandId && props.onRunSupportCommand));
  const button = (
    <button
      aria-label={props.ariaLabel}
      className={settingsButtonClassName(`gap-2 ${props.className ?? ''}`)}
      disabled={!canRun}
      onClick={() => {
        props.onRunStart?.();
        if (props.onRunAction) {
          props.onRunAction();
        } else if (props.commandId) {
          props.onRunSupportCommand?.(props.commandId);
        }
      }}
      type="button"
    >
      {Icon ? <Icon aria-hidden="true" className="size-4 shrink-0 text-settings-icon-active" strokeWidth={1.8} /> : null}
      {props.children}
    </button>
  );
  if (!props.tooltip) {
    return button;
  }
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>{button}</AppTooltipTrigger>
      <AppTooltipContent side="top">{props.tooltip}</AppTooltipContent>
    </AppTooltip>
  );
}

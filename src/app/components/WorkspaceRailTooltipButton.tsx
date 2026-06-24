import type { ComponentPropsWithoutRef } from 'react';

import {
  AppIconButton,
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger
} from '../../shared/ui';

type WorkspaceRailTooltipButtonProps = ComponentPropsWithoutRef<typeof AppIconButton>;

export const WORKSPACE_RAIL_BUTTON_FOCUS_CLASS_NAME =
  'focus-visible:bg-foreground/[0.06] focus-visible:ring-0 focus-visible:[box-shadow:none] focus-visible:[--tw-ring-shadow:0_0_#0000]';

export function WorkspaceRailTooltipButton(props: WorkspaceRailTooltipButtonProps) {
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <span className="inline-flex">
          <AppIconButton focusRing="none" {...props} />
        </span>
      </AppTooltipTrigger>
      <AppTooltipContent side="right" sideOffset={8}>
        {props.label}
      </AppTooltipContent>
    </AppTooltip>
  );
}

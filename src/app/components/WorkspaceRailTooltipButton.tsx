import type { ComponentPropsWithoutRef } from 'react';

import {
  AppIconButton,
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger
} from '../../shared/ui';

type WorkspaceRailTooltipButtonProps = ComponentPropsWithoutRef<typeof AppIconButton>;

export function WorkspaceRailTooltipButton(props: WorkspaceRailTooltipButtonProps) {
  return (
    <AppTooltip>
      <AppTooltipTrigger asChild>
        <span className="inline-flex">
          <AppIconButton {...props} />
        </span>
      </AppTooltipTrigger>
      <AppTooltipContent side="right" sideOffset={8}>
        {props.label}
      </AppTooltipContent>
    </AppTooltip>
  );
}

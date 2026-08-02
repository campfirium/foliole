import { useCallback, useState } from 'react';
import type {
  ComponentPropsWithoutRef,
  MouseEvent,
  PointerEvent
} from 'react';

import {
  AppIconButton,
  AppTooltip,
  AppTooltipContent,
  AppTooltipTrigger
} from '../../shared/ui';

type WorkspaceRailTooltipButtonProps = ComponentPropsWithoutRef<typeof AppIconButton> & {
  forceTooltipOpen?: boolean;
};

export const WORKSPACE_RAIL_BUTTON_FOCUS_CLASS_NAME =
  'focus-visible:bg-foreground/[0.06]';

export function WorkspaceRailTooltipButton({
  forceTooltipOpen = false,
  onClick,
  onPointerDown,
  ...props
}: WorkspaceRailTooltipButtonProps) {
  const [open, setOpen] = useState(false);
  const closeTooltip = useCallback(() => setOpen(false), []);
  const handlePointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    closeTooltip();
    onPointerDown?.(event);
  }, [closeTooltip, onPointerDown]);
  const handleClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    closeTooltip();
    event.currentTarget.blur();
    onClick?.(event);
  }, [closeTooltip, onClick]);

  return (
    <AppTooltip
      open={forceTooltipOpen || open}
      onOpenChange={(nextOpen) => {
        if (!forceTooltipOpen) setOpen(nextOpen);
      }}
    >
      <AppTooltipTrigger asChild>
        <span className="inline-flex">
          <AppIconButton
            focusRing="none"
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            {...props}
          />
        </span>
      </AppTooltipTrigger>
      <AppTooltipContent side="right" sideOffset={8}>
        {props.label}
      </AppTooltipContent>
    </AppTooltip>
  );
}

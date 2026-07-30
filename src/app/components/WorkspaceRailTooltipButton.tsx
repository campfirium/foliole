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

type WorkspaceRailTooltipButtonProps = ComponentPropsWithoutRef<typeof AppIconButton>;

export const WORKSPACE_RAIL_BUTTON_FOCUS_CLASS_NAME =
  'focus-visible:bg-foreground/[0.06]';

export function WorkspaceRailTooltipButton({
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
    <AppTooltip open={open} onOpenChange={setOpen}>
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

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import { cn } from '@/shared/lib/utils';

const AppTooltipProvider = TooltipPrimitive.Provider;
const AppTooltipTrigger = TooltipPrimitive.Trigger;
const AppTooltipPortal = TooltipPrimitive.Portal;

function AppTooltip(props: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={100}>
      <TooltipPrimitive.Root {...props} />
    </TooltipPrimitive.Provider>
  );
}

const AppTooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      collisionPadding={8}
      sideOffset={sideOffset}
      className={cn(
        'z-50 max-w-[240px] rounded-[var(--app-tooltip-radius)] border border-[var(--app-tooltip-border-color)] bg-[var(--app-tooltip-bg)] px-[var(--app-tooltip-padding-x)] py-[var(--app-tooltip-padding-y)] text-[var(--app-tooltip-font-size)] font-normal leading-[var(--app-tooltip-line-height)] text-[var(--app-tooltip-fg)] [box-shadow:var(--app-tooltip-shadow)]',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
AppTooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { AppTooltip, AppTooltipContent, AppTooltipPortal, AppTooltipProvider, AppTooltipTrigger };

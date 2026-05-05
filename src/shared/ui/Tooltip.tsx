import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import { appFloatingSurfaceClassName } from './FloatingSurface';

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
        appFloatingSurfaceClassName('popover'),
        'z-50 max-w-[240px] px-2.5 py-1.5 text-xs font-medium leading-5 text-foreground',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
AppTooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { AppTooltip, AppTooltipContent, AppTooltipPortal, AppTooltipProvider, AppTooltipTrigger };

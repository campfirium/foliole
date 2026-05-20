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

type AppTooltipContentProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
  arrow?: boolean;
};

function AppTooltipArrow() {
  return (
    <TooltipPrimitive.Arrow asChild height={7} width={12}>
      <svg
        aria-hidden="true"
        className="translate-y-[-1px] overflow-visible"
        focusable="false"
        height="7"
        viewBox="0 0 12 7"
        width="12"
      >
        <path
          d="M 0 0 L 6 7 L 12 0"
          fill="var(--app-tooltip-bg)"
          stroke="var(--app-tooltip-border-color)"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </TooltipPrimitive.Arrow>
  );
}

const AppTooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  AppTooltipContentProps
>(({ arrow = false, children, className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      collisionPadding={8}
      sideOffset={sideOffset}
      className={cn(
        'z-floating max-w-[min(22rem,calc(100vw-2rem))] whitespace-normal break-words rounded-[var(--app-tooltip-radius)] border border-[var(--app-tooltip-border-color)] bg-[var(--app-tooltip-bg)] px-[var(--app-tooltip-padding-x)] py-[var(--app-tooltip-padding-y)] text-left text-[var(--app-tooltip-font-size)] font-normal leading-[var(--app-tooltip-line-height)] text-[var(--app-tooltip-fg)] [box-shadow:var(--app-tooltip-shadow)]',
        className
      )}
      {...props}
    >
      {children}
      {arrow ? <AppTooltipArrow /> : null}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
));
AppTooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { AppTooltip, AppTooltipContent, AppTooltipPortal, AppTooltipProvider, AppTooltipTrigger };

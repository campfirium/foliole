import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';

import { cn } from '@/shared/lib/utils';

const AppTooltipProvider = TooltipPrimitive.Provider;
const AppTooltipTrigger = TooltipPrimitive.Trigger;

function AppTooltip(props: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipPrimitive.Provider delayDuration={300} skipDelayDuration={100}>
      <TooltipPrimitive.Root {...props} />
    </TooltipPrimitive.Provider>
  );
}

type AppTooltipContentProps = React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & {
  arrow?: boolean;
  surface?: 'default' | 'truncated';
};

const TOOLTIP_SURFACE_CLASS_NAMES: Record<NonNullable<AppTooltipContentProps['surface']>, string> = {
  default: '',
  truncated: [
    'relative max-w-[min(15rem,calc(100vw-2rem))] overflow-visible border-transparent bg-transparent p-0',
    '[--app-tooltip-bg:color-mix(in_srgb,rgb(var(--color-bg-elevated))_88%,rgb(var(--color-bg-panel))_12%)]',
    '[--app-tooltip-border-color:rgb(var(--color-foreground)/0.12)]',
    '[--app-tooltip-fg:rgb(var(--color-foreground)/0.86)]',
    '[--app-tooltip-line-height:1.375rem]',
    '[--app-tooltip-padding-x:0.75rem]',
    '[--app-tooltip-padding-y:0.5rem]',
    '[--app-tooltip-shadow:var(--shadow-panel)]'
  ].join(' ')
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
>(({ arrow = false, children, className, sideOffset = 6, surface = 'default', ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      collisionPadding={8}
      sideOffset={sideOffset}
      className={cn(
        'z-floating max-w-[min(22rem,calc(100vw-2rem))] whitespace-normal break-words rounded-[var(--app-tooltip-radius)] border border-[var(--app-tooltip-border-color)] bg-[var(--app-tooltip-bg)] px-[var(--app-tooltip-padding-x)] py-[var(--app-tooltip-padding-y)] text-left text-[var(--app-tooltip-font-size)] font-normal leading-[var(--app-tooltip-line-height)] text-[var(--app-tooltip-fg)] [box-shadow:var(--app-tooltip-shadow)]',
        TOOLTIP_SURFACE_CLASS_NAMES[surface],
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

export { AppTooltip, AppTooltipContent, AppTooltipProvider, AppTooltipTrigger };

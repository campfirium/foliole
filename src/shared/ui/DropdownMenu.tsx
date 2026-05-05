import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as React from 'react';

import { cn } from '@/lib/utils';

const AppDropdownMenu = DropdownMenuPrimitive.Root;
const AppDropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const AppDropdownMenuPortal = DropdownMenuPrimitive.Portal;

const AppDropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[188px] overflow-hidden rounded-xl border border-border bg-bg-elevated p-1 text-foreground shadow-[0_10px_26px_-18px_rgba(15,23,42,0.42)]',
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
AppDropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const AppDropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(({ className, ...props }, ref) => (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
      'relative flex min-h-9 cursor-default select-none items-center rounded-md px-3 text-sm font-semibold outline-none transition-colors focus:bg-accent/10 data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
        className
      )}
      {...props}
  />
));
AppDropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

export { AppDropdownMenu, AppDropdownMenuContent, AppDropdownMenuItem, AppDropdownMenuPortal, AppDropdownMenuTrigger };

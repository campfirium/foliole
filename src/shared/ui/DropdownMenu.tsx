import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as React from 'react';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { appFloatingSurfaceClassName } from './FloatingSurface';

import { cn } from '@/shared/lib/utils';
import { onWindowKeydown } from '@/shared/platform/keyboard';

function AppDropdownMenu(props: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root modal={false} {...props} />;
}
const AppDropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const AppDropdownMenuPortal = DropdownMenuPrimitive.Portal;
const AppDropdownMenuLabel = DropdownMenuPrimitive.Label;
const AppDropdownMenuSeparator = DropdownMenuPrimitive.Separator;

interface AppSelectionDropdownMenuProps {
  children: ReactNode;
  left: number;
  onClose: () => void;
  top: number;
}

type AppSelectionDropdownMenuItemProps = ButtonHTMLAttributes<HTMLButtonElement>;

function dropdownMenuContentClassName(className?: string) {
  return cn(
    appFloatingSurfaceClassName('popover'),
    'pointer-events-auto z-50 min-w-[188px] overflow-hidden p-1 text-foreground',
    className
  );
}

function dropdownMenuItemClassName(className?: string) {
  return cn(
    'relative flex min-h-9 cursor-default select-none items-center px-3 text-sm font-semibold outline-none transition-colors focus:bg-[var(--app-selection-surface-color)] data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
    className
  );
}

const AppDropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={dropdownMenuContentClassName(className)}
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
    className={dropdownMenuItemClassName(className)}
    {...props}
  />
));
AppDropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

function preventFocusSteal(event: { preventDefault: () => void }) {
  event.preventDefault();
}

function AppSelectionDropdownMenu({ children, left, onClose, top }: AppSelectionDropdownMenuProps) {
  useEffect(() => onWindowKeydown((event) => event.key === 'Escape' && onClose()), [onClose]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40"
        onContextMenu={(event) => event.preventDefault()}
        onPointerDown={onClose}
      />
      <div
        aria-label="Selection commands"
        className={cn(dropdownMenuContentClassName(), 'fixed')}
        onContextMenu={(event) => event.preventDefault()}
        role="menu"
        style={{ left: `${left}px`, top: `${top}px` }}
      >
        {children}
      </div>
    </>,
    document.body
  );
}

function AppSelectionDropdownMenuItem({
  children,
  className,
  onMouseDown,
  onPointerDown,
  ...props
}: AppSelectionDropdownMenuItemProps) {
  return (
    <button
      className={cn(
        dropdownMenuItemClassName(className),
        'w-full text-left hover:bg-[var(--app-selection-surface-color)] disabled:pointer-events-none disabled:opacity-50'
      )}
      onMouseDown={(event) => {
        preventFocusSteal(event);
        onMouseDown?.(event);
      }}
      onPointerDown={(event) => {
        preventFocusSteal(event);
        onPointerDown?.(event);
      }}
      role="menuitem"
      type="button"
      {...props}
    >
      {children}
    </button>
  );
}

export {
  AppDropdownMenu,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuPortal,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppSelectionDropdownMenu,
  AppSelectionDropdownMenuItem
};

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as React from 'react';
import { useEffect, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useTranslation } from '../localization/LocalizationProvider';

import { appFloatingSurfaceClassName } from './FloatingSurface';

import { cn } from '@/shared/lib/utils';
import { onWindowEscape } from '@/shared/platform/keyboard';

function AppDropdownMenu(props: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root modal={false} {...props} />;
}
const AppDropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const AppDropdownMenuPortal = DropdownMenuPrimitive.Portal;

interface AppSelectionDropdownMenuProps {
  children: ReactNode;
  left: number;
  onClose: () => void;
  outsidePointerMode?: 'blocking' | 'passthrough';
  top: number;
}

type AppSelectionDropdownMenuItemProps = ButtonHTMLAttributes<HTMLButtonElement>;
type AppDropdownMenuCheckItemProps = React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
  checked: boolean;
};

function dropdownMenuContentClassName(className?: string) {
  return cn(
    appFloatingSurfaceClassName('popover'),
    'pointer-events-auto z-dropdown min-w-[188px] overflow-hidden p-1 text-foreground',
    className
  );
}

function dropdownMenuItemClassName(className?: string) {
  return cn(
    'relative flex min-h-8 cursor-default select-none items-center gap-2 rounded-md px-2 py-1 text-ui-base font-normal leading-5 text-foreground/78 outline-none transition-colors',
    'focus:bg-[var(--app-floating-item-hover-bg)] focus:text-foreground data-[highlighted]:bg-[var(--app-floating-item-hover-bg)] data-[highlighted]:text-foreground',
    'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
    className
  );
}

function dropdownMenuLabelClassName(className?: string) {
  return cn('px-2 pb-1 pt-2 text-ui-sm font-medium text-foreground/45', className);
}

function dropdownMenuSeparatorClassName(className?: string) {
  return cn('mx-1 my-1.5 h-px bg-[var(--app-floating-divider-color)]', className);
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

const AppDropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={dropdownMenuLabelClassName(className)}
    {...props}
  />
));
AppDropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;

const AppDropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={dropdownMenuSeparatorClassName(className)}
    {...props}
  />
));
AppDropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

function AppDropdownMenuCheckItem({
  checked,
  children,
  className,
  ...props
}: AppDropdownMenuCheckItemProps) {
  return (
    <AppDropdownMenuItem
      aria-checked={checked}
      className={cn('justify-between', className)}
      {...props}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span aria-hidden="true" className={cn('flex h-5 w-5 shrink-0 items-center justify-center', checked ? 'text-foreground' : 'invisible')}>
        <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16">
          <path d="m3.2 8.5 3 3 6.4-6.4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.3" />
        </svg>
      </span>
    </AppDropdownMenuItem>
  );
}

function preventFocusSteal(event: { preventDefault: () => void }) {
  event.preventDefault();
}

function AppSelectionDropdownMenu({
  children,
  left,
  onClose,
  outsidePointerMode = 'blocking',
  top
}: AppSelectionDropdownMenuProps) {
  const t = useTranslation();
  const menuRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => onWindowEscape(onClose), [onClose]);
  useEffect(() => {
    if (outsidePointerMode !== 'passthrough') {
      return undefined;
    }
    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      onClose();
    };
    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true);
  }, [onClose, outsidePointerMode]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <>
      {outsidePointerMode === 'blocking' ? (
        <div
          aria-hidden="true"
          className="fixed inset-0 z-workspace-overlay"
          onContextMenu={(event) => event.preventDefault()}
          onPointerDown={onClose}
        />
      ) : null}
      <div
        aria-label={t('shared.selection.commands')}
        className={cn(
          dropdownMenuContentClassName(),
          'fixed p-2 shadow-popover',
          'bg-[color-mix(in_oklab,var(--app-floating-surface-bg)_82%,rgb(var(--color-background)))]'
        )}
        onContextMenu={(event) => event.preventDefault()}
        ref={menuRef}
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
        'w-full text-left hover:bg-[var(--app-selection-surface-color)] focus:bg-[var(--app-selection-surface-color)] disabled:pointer-events-none disabled:opacity-45'
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
  AppDropdownMenuCheckItem,
  AppDropdownMenuContent,
  AppDropdownMenuItem,
  AppDropdownMenuLabel,
  AppDropdownMenuPortal,
  AppDropdownMenuSeparator,
  AppDropdownMenuTrigger,
  AppSelectionDropdownMenu,
  AppSelectionDropdownMenuItem
};

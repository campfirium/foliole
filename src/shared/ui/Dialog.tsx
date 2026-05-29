import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';

import { appFloatingSurfaceClassName } from './FloatingSurface';

import { cn } from '@/shared/lib/utils';

const AppDialog = DialogPrimitive.Root;
const AppDialogTrigger = DialogPrimitive.Trigger;
const AppDialogPortal = DialogPrimitive.Portal;
const AppDialogClose = DialogPrimitive.Close;

const AppDialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-modal-overlay bg-foreground/10', className)}
    {...props}
  />
));
AppDialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const AppDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Content
    ref={ref}
    className={cn(
      appFloatingSurfaceClassName('panel'),
      'fixed left-1/2 top-1/2 z-modal -translate-x-1/2 -translate-y-1/2 [transform:translate(-50%,-50%)] text-foreground outline-none',
      className
    )}
    {...props}
  />
));
AppDialogContent.displayName = DialogPrimitive.Content.displayName;

const AppDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-[1.16rem] font-semibold text-foreground', className)}
    {...props}
  />
));
AppDialogTitle.displayName = DialogPrimitive.Title.displayName;

const AppDialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm leading-6 text-foreground/68', className)}
    {...props}
  />
));
AppDialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  AppDialog,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppDialogTrigger
};

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

type AppDialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  layout?: 'bare' | 'task';
};

const AppDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  AppDialogContentProps
>(({ className, layout = 'bare', onOpenAutoFocus, ...props }, ref) => {
  const contentRef = React.useRef<React.ElementRef<typeof DialogPrimitive.Content> | null>(null);
  const setContentRef = React.useCallback(
    (node: React.ElementRef<typeof DialogPrimitive.Content> | null) => {
      contentRef.current = node;
      if (typeof ref === 'function') {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<React.ElementRef<typeof DialogPrimitive.Content> | null>).current = node;
      }
    },
    [ref]
  );

  function handleOpenAutoFocus(event: Event) {
    onOpenAutoFocus?.(event);
    if (event.defaultPrevented) {
      return;
    }
    event.preventDefault();
    contentRef.current?.focus({ preventScroll: true });
  }

  return (
    <DialogPrimitive.Content
      ref={setContentRef}
      className={cn(
        appFloatingSurfaceClassName('panel'),
        'fixed left-1/2 top-1/2 z-modal -translate-x-1/2 -translate-y-1/2 text-foreground outline-none',
        layout === 'task' && 'p-dialog-gutter',
        className
      )}
      onOpenAutoFocus={handleOpenAutoFocus}
      tabIndex={-1}
      {...props}
    />
  );
});
AppDialogContent.displayName = DialogPrimitive.Content.displayName;

const AppDialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-ui-xl font-semibold text-foreground', className)}
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
    className={cn('text-ui-md leading-6 text-foreground/68', className)}
    {...props}
  />
));
AppDialogDescription.displayName = DialogPrimitive.Description.displayName;

const AppDialogBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mt-dialog-section-gap min-h-0', className)} {...props} />
  )
);
AppDialogBody.displayName = 'AppDialogBody';

const AppDialogActions = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('mt-dialog-section-gap flex shrink-0 items-center justify-end gap-2', className)} {...props} />
  )
);
AppDialogActions.displayName = 'AppDialogActions';

export {
  AppDialog,
  AppDialogActions,
  AppDialogBody,
  AppDialogClose,
  AppDialogContent,
  AppDialogDescription,
  AppDialogOverlay,
  AppDialogPortal,
  AppDialogTitle,
  AppDialogTrigger
};

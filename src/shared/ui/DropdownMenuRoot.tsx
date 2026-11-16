import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { useContext, useEffect, useId, useRef, useState, type ComponentPropsWithoutRef } from 'react';

import { DropdownMenuOpeningContext, type DropdownMenuOpening } from './DropdownMenuFocusReturn';
import { FloatingBarMenuContext } from './FloatingBar';

export function AppDropdownMenu(
  { defaultOpen = false, open: controlledOpen, onOpenChange, ...props }: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>
) {
  const activity = useContext(FloatingBarMenuContext);
  const id = useId();
  const [open, setOpen] = useState(defaultOpen);
  const visible = controlledOpen ?? open;
  const opening = useRef<DropdownMenuOpening>({ pending: null, active: null });
  useEffect(() => {
    activity?.(id, visible);
    return () => activity?.(id, false);
  }, [activity, id, visible]);
  return (
    <DropdownMenuOpeningContext.Provider value={opening}>
      <DropdownMenuPrimitive.Root
        modal={false}
        {...props}
        open={visible}
        onOpenChange={(next) => {
          if (next) opening.current.active = opening.current.pending;
          setOpen(next);
          onOpenChange?.(next);
          const active = next ? opening.current.active : null;
          if (!active) return;
          queueMicrotask(() => {
            if (active.trigger.getAttribute('aria-expanded') !== 'true' && opening.current.active === active) {
              opening.current.active = null;
            }
          });
        }}
      />
    </DropdownMenuOpeningContext.Provider>
  );
}

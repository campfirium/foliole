import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { useContext, useEffect, useId, useState, type ComponentPropsWithoutRef } from 'react';

import { FloatingBarMenuContext } from './FloatingBar';

export function AppDropdownMenu(
  props: ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Root>
) {
  const activity = useContext(FloatingBarMenuContext);
  const id = useId();
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  const visible = props.open ?? open;
  useEffect(() => {
    activity?.(id, visible);
    return () => activity?.(id, false);
  }, [activity, id, visible]);
  return (
    <DropdownMenuPrimitive.Root
      modal={false}
      {...props}
      onOpenChange={(next) => {
        setOpen(next);
        props.onOpenChange?.(next);
      }}
    />
  );
}

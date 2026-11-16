import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { createContext, forwardRef, useContext, type ComponentPropsWithoutRef, type RefObject } from 'react';

interface MenuOpeningInput {
  trigger: HTMLButtonElement;
  input: 'pointer' | 'keyboard';
}

export interface DropdownMenuOpening {
  pending: MenuOpeningInput | null;
  active: MenuOpeningInput | null;
}

export const DropdownMenuOpeningContext = createContext<RefObject<DropdownMenuOpening> | null>(null);

const returnAttribute = 'data-menu-focus-return';

function recordOpening(opening: DropdownMenuOpening | undefined, input: MenuOpeningInput) {
  if (!opening || input.trigger.disabled || input.trigger.getAttribute('aria-expanded') !== 'false') return;
  opening.pending = input;
  queueMicrotask(() => {
    if (opening.pending === input) opening.pending = null;
  });
}

export const AppDropdownMenuTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Trigger>
>(function AppDropdownMenuTrigger({ onBlur, onKeyDown, onPointerDown, ...props }, ref) {
  const opening = useContext(DropdownMenuOpeningContext);
  return (
    <DropdownMenuPrimitive.Trigger
      {...props}
      ref={ref}
      onBlur={event => {
        event.currentTarget.removeAttribute(returnAttribute);
        onBlur?.(event);
      }}
      onKeyDown={event => {
        event.currentTarget.removeAttribute(returnAttribute);
        onKeyDown?.(event);
        if (!event.defaultPrevented && ['Enter', ' ', 'ArrowDown'].includes(event.key)) {
          recordOpening(opening?.current, { trigger: event.currentTarget, input: 'keyboard' });
        }
      }}
      onPointerDown={event => {
        onPointerDown?.(event);
        const trigger = event.currentTarget;
        trigger.removeAttribute(returnAttribute);
        if (!event.defaultPrevented && event.button === 0 && !event.ctrlKey) {
          recordOpening(opening?.current, { trigger, input: 'pointer' });
        }
      }}
    />
  );
});

export function useDropdownMenuCloseFocus(onCloseAutoFocus: ((event: Event) => void) | undefined) {
  const opening = useContext(DropdownMenuOpeningContext);
  return (event: Event) => {
    const active = opening?.current.active;
    if (opening) opening.current.active = null;
    onCloseAutoFocus?.(event);
    if (!active || event.defaultPrevented) return;
    const { trigger, input } = active;
    if (trigger.ownerDocument.activeElement === trigger) return;

    // Radix restores focus after this callback and can skip it for outside interactions.
    queueMicrotask(() => {
      if (trigger.ownerDocument.activeElement === trigger && trigger.getAttribute('aria-expanded') === 'false') {
        trigger.setAttribute(returnAttribute, input);
      }
    });
  };
}

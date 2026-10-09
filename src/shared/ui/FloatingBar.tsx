import {
  createContext,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode
} from 'react';

import { cn } from '../lib/utils';

export const FloatingBarMenuContext = createContext<((id: string, open: boolean) => void) | null>(
  null
);

function useBarActivity(onActiveChange: (id: string, active: boolean) => void) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const { pressed, setPressed } = usePressProtection();
  const [menus, setMenus] = useState<Set<string>>(() => new Set());
  const menuActivity = useCallback((menuId: string, open: boolean) => {
    setMenus((current) => {
      if (current.has(menuId) === open) return current;
      const next = new Set(current);
      if (open) next.add(menuId);
      else next.delete(menuId);
      return next;
    });
  }, []);
  useEffect(() => {
    if (!menus.size) setFocused(root.current?.contains(document.activeElement) ?? false);
  }, [menus]);
  const active = hovered || focused || pressed || menus.size > 0;
  useEffect(() => {
    onActiveChange(id, active);
    return () => onActiveChange(id, false);
  }, [active, id, onActiveChange]);
  return { root, setHovered, setFocused, setPressed, menuActivity };
}

export function FloatingBar(props: {
  children: ReactNode;
  className?: string;
  floating: boolean;
  visible: boolean;
  onActiveChange: (id: string, active: boolean) => void;
  testId: string;
}) {
  const { root, setHovered, setFocused, setPressed, menuActivity } = useBarActivity(
    props.onActiveChange
  );
  return (
    <FloatingBarMenuContext.Provider value={menuActivity}>
      <div
        ref={root}
        data-testid={props.testId}
        data-floating={props.floating}
        data-visible={props.visible}
        aria-hidden={props.floating && !props.visible ? true : undefined}
        className={cn(
          props.floating ? 'absolute inset-x-0 z-floating shadow-popover' : 'relative flex-none',
          props.floating && !props.visible && 'invisible pointer-events-none',
          props.className
        )}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onPointerDownCapture={() => setPressed(true)}
        onPointerUpCapture={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={() => setFocused(false)}
      >
        {props.children}
      </div>
    </FloatingBarMenuContext.Provider>
  );
}

function usePressProtection() {
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    if (!pressed) return;
    const release = () => setPressed(false);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [pressed]);
  return { pressed, setPressed };
}

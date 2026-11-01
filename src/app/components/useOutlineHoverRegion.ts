import { useEffect, type RefObject } from 'react';

export function useOutlineHoverRegion(props: {
  isOpen: boolean;
  layerRef: RefObject<HTMLDivElement | null>;
  onEnter: (clientY: number) => void;
  onLeave: () => void;
}) {
  const { isOpen, layerRef, onEnter, onLeave } = props;
  useEffect(() => {
    const layer = layerRef.current;
    const host = layer?.parentElement;
    if (!layer || !host) return;
    let inside = false;
    const leave = () => {
      if (inside || isOpen) onLeave();
      inside = false;
    };
    const move = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!layer.contains(target) && target?.closest('button, a, input, textarea, select, [role="button"]')) {
        leave();
        return;
      }
      const bounds = layer.getBoundingClientRect();
      const nextInside = event.clientX >= bounds.left && event.clientX <= bounds.right
        && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
      if (nextInside && !inside && !isOpen) onEnter(event.clientY);
      else if (!nextInside) leave();
      inside = nextInside;
    };
    host.addEventListener('mousemove', move);
    host.addEventListener('mouseleave', leave);
    return () => {
      host.removeEventListener('mousemove', move);
      host.removeEventListener('mouseleave', leave);
    };
  }, [isOpen, layerRef, onEnter, onLeave]);
}

import { useEffect, useState, type RefObject } from 'react';

export function useVirtualListScrollMargin(
  rootRef: RefObject<HTMLDivElement | null>,
  scrollRef: RefObject<HTMLElement | null>,
  enabled: boolean
) {
  const [margin, setMargin] = useState(0);
  useEffect(() => {
    const root = rootRef.current;
    const scroll = scrollRef.current;
    if (!enabled || !root || !scroll) return;
    const measure = () => setMargin(root.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(scroll);
    if (root.parentElement) observer?.observe(root.parentElement);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [enabled, rootRef, scrollRef]);
  return margin;
}

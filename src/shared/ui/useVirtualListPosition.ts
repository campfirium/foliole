import type { Virtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, type RefObject } from 'react';

import { resolveVirtualListAnchorIndex, type VirtualListPosition } from './virtualListPosition';

interface PositionArgs {
  keys: readonly string[];
  position?: VirtualListPosition | undefined;
  rootRef: RefObject<HTMLDivElement | null>;
  scrollElementRef: RefObject<HTMLElement | null>;
  virtualizer?: Virtualizer<HTMLElement, Element> | undefined;
}

export function useVirtualListPosition(args: PositionArgs) {
  const latest = useRef(args);
  latest.current = args;
  useEffect(() => {
    const scroll = args.scrollElementRef.current;
    const root = args.rootRef.current;
    const position = args.position;
    if (!scroll || !root || !position) return;
    let restoring = true;
    let frame = 0;
    const saved = position.read();
    const restore = () => {
      if (!restoring) return;
      const { keys, virtualizer } = latest.current;
      if (!saved || !keys.length) { scroll.scrollTop = 0; return; }
      const index = resolveVirtualListAnchorIndex(saved, keys);
      const offset = virtualizer?.getOffsetForIndex(index, 'start')?.[0];
      const element = root.querySelector<HTMLElement>(`[data-list-position-index="${index}"]`);
      const start = offset ?? (element
        ? element.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop
        : null);
      if (start !== null) scroll.scrollTop = Math.max(0, start + saved.offset);
    };
    const capture = () => {
      if (!restoring) capturePosition(latest.current, scroll, root, position);
    };
    const release = () => { restoring = false; cancelAnimationFrame(frame); };
    restore();
    frame = requestAnimationFrame(() => {
      restore();
      frame = requestAnimationFrame(() => { restore(); restoring = false; capture(); });
    });
    scroll.addEventListener('scroll', capture, { passive: true });
    scroll.addEventListener('touchstart', release, { passive: true });
    scroll.addEventListener('pointerdown', release, { passive: true });
    scroll.addEventListener('wheel', release, { passive: true });
    scroll.addEventListener('keydown', release);
    return () => {
      cancelAnimationFrame(frame);
      scroll.removeEventListener('scroll', capture);
      scroll.removeEventListener('touchstart', release);
      scroll.removeEventListener('pointerdown', release);
      scroll.removeEventListener('wheel', release);
      scroll.removeEventListener('keydown', release);
    };
  }, [args.position, args.rootRef, args.scrollElementRef, args.keys]);
}

function capturePosition(args: PositionArgs, scroll: HTMLElement, root: HTMLElement, position: VirtualListPosition) {
  const { keys, virtualizer } = args;
  const visible = virtualizer?.getVirtualItemForOffset(scroll.scrollTop);
  const elements = visible ? [] : [...root.querySelectorAll<HTMLElement>('[data-list-position-index]')];
  const element = elements.find((item) => item.getBoundingClientRect().bottom > scroll.getBoundingClientRect().top);
  const index = visible?.index ?? (element ? Number(element.dataset.listPositionIndex) : -1);
  const key = keys[index];
  if (key === undefined) return;
  const start = visible?.start ?? (element!.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop);
  position.write({ index, key, offset: scroll.scrollTop - start, order: keys });
}

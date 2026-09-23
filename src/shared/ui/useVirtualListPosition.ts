import type { Virtualizer } from '@tanstack/react-virtual';
import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

import { resolveVirtualListAnchorIndex, type VirtualListAnchor, type VirtualListPosition } from './virtualListPosition';

interface PositionArgs {
  keys: readonly string[];
  measureItems?: boolean | undefined;
  remeasureFrame?: RefObject<number | null> | undefined;
  position?: VirtualListPosition | undefined;
  rootRef: RefObject<HTMLDivElement | null>;
  scrollElementRef: RefObject<HTMLElement | null>;
  virtualizer?: Virtualizer<HTMLElement, Element> | undefined;
}

export function useVirtualListPosition(args: PositionArgs) {
  const latest = useRef(args);
  latest.current = args;
  const restoreAfterLayout = useRef<(() => void) | null>(null);
  useLayoutEffect(() => { restoreAfterLayout.current?.(); });
  useEffect(() => {
    const scroll = args.scrollElementRef.current;
    const root = args.rootRef.current;
    const position = args.position;
    if (!scroll || !root || !position) return;
    const virtualizer = args.virtualizer;
    const adjustOnResize = virtualizer?.shouldAdjustScrollPositionOnItemSizeChange;
    // The saved anchor owns corrections until measured restoration completes.
    if (virtualizer) virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () => false;
    let restoring = true;
    let frame = 0;
    const saved = position.read();
    const restore = () => {
      if (restoring) restorePosition(latest.current, scroll, root, saved);
    };
    const capture = () => {
      if (!restoring) capturePosition(latest.current, scroll, root, position);
    };
    const release = () => {
      if (virtualizer) virtualizer.shouldAdjustScrollPositionOnItemSizeChange = adjustOnResize;
      restoring = false;
      restoreAfterLayout.current = null;
      window.cancelAnimationFrame(frame);
    };
    const finishWhenMeasured = () => {
      if (!restoring) return;
      restore();
      const attached = !virtualizer || virtualizer.scrollElement === scroll;
      if (attached && latest.current.remeasureFrame?.current == null && rowsAreMeasured(latest.current, root)) {
        release();
        capture();
      }
      else frame = window.requestAnimationFrame(finishWhenMeasured);
    };
    restoreAfterLayout.current = restore;
    restore();
    frame = window.requestAnimationFrame(finishWhenMeasured);
    scroll.addEventListener('scroll', capture, { passive: true });
    scroll.addEventListener('touchstart', release, { passive: true });
    scroll.addEventListener('pointerdown', release, { passive: true });
    scroll.addEventListener('wheel', release, { passive: true });
    scroll.addEventListener('keydown', release);
    return () => {
      release();
      scroll.removeEventListener('scroll', capture);
      scroll.removeEventListener('touchstart', release);
      scroll.removeEventListener('pointerdown', release);
      scroll.removeEventListener('wheel', release);
      scroll.removeEventListener('keydown', release);
    };
  }, [args.position, args.rootRef, args.scrollElementRef, args.keys, args.virtualizer]);
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

function restorePosition(args: PositionArgs, scroll: HTMLElement, root: HTMLElement, saved?: VirtualListAnchor) {
  const { keys, virtualizer } = args;
  if (!saved || !keys.length) { scroll.scrollTop = 0; return; }
  const index = resolveVirtualListAnchorIndex(saved, keys);
  const offset = virtualizer?.getOffsetForIndex(index, 'start')?.[0];
  const element = root.querySelector<HTMLElement>(`[data-list-position-index="${index}"]`);
  const start = offset ?? (element
    ? element.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop
    : null);
  if (start !== null) scroll.scrollTop = Math.max(0, start + saved.offset);
}

function rowsAreMeasured(args: PositionArgs, root: HTMLElement) {
  if (!args.measureItems || !args.virtualizer || root.offsetHeight === 0) return true;
  return args.virtualizer.getVirtualItems().every((item) => {
    const element = root.querySelector<HTMLElement>(`[data-list-position-index="${item.index}"]`);
    return element !== null && Math.abs(element.offsetHeight - item.size) < 1;
  });
}

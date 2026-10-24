import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type RefObject } from 'react';

import type { VirtualListAnchor } from '../../../shared/ui/virtualListPosition';

export interface SimplePdfPosition { page: number; fraction: number }
export interface SimplePdfPositionPersistence {
  initial?: SimplePdfPosition | undefined;
  onChange?: ((position: SimplePdfPosition) => void) | undefined;
}

interface SavedPage { anchor: VirtualListAnchor; fraction: number; width: number }
interface PendingPage { page: number; fraction: number; attempts: number; until: number }
interface PositionRefs {
  frame: MutableRefObject<number>;
  pending: MutableRefObject<PendingPage | null>;
  saved: MutableRefObject<SavedPage | undefined>;
  scrollRef: RefObject<HTMLDivElement | null>;
  persistence: MutableRefObject<SimplePdfPositionPersistence | undefined>;
}

function usePagePosition(refs: PositionRefs, width: number, initialPage: number) {
  const { pending, saved, scrollRef } = refs;
  const previousTarget = useRef(initialPage);
  return useMemo(() => {
    const previous = initialPage === previousTarget.current ? saved.current : undefined;
    if (!previous) saved.current = undefined;
    previousTarget.current = initialPage;
    const anchor = previous?.anchor ?? { key: String(initialPage), index: initialPage - 1, offset: 0, order: [] };
    const restored = { ...anchor, offset: previous ? anchor.offset * width / previous.width : 0 };
    return {
      read: () => restored,
      write: (next: VirtualListAnchor) => {
        if (pending.current) return;
        const row = scrollRef.current?.querySelector<HTMLElement>(`[data-list-position-index="${next.index}"]`);
        const height = row?.getBoundingClientRect().height || width * 1.414;
        const fraction = Math.max(0, Math.min(1, next.offset / height));
        saved.current = { anchor: next, fraction, width };
        refs.persistence.current?.onChange?.({ page: next.index + 1, fraction });
      }
    };
  }, [initialPage, pending, saved, scrollRef, width]);
}

function usePagePositionLifetime(refs: PositionRefs, position: ReturnType<typeof usePagePosition>, initialPage: number) {
  const { frame, pending, saved, scrollRef } = refs;
  const [pinned, setPinned] = useState<number | null>(initialPage);
  useEffect(() => {
    const scroll = scrollRef.current;
    const anchor = position.read();
    const page = anchor.index + 1;
    setPinned(page);
    pending.current = { page, fraction: saved.current?.fraction ?? refs.persistence.current?.initial?.fraction ?? 0, attempts: 0, until: Date.now() + 3000 };
    const release = () => { pending.current = null; cancelAnimationFrame(frame.current); setPinned(null); };
    const timeout = window.setTimeout(release, 3000);
    const events = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const;
    events.forEach((event) => scroll?.addEventListener(event, release, { passive: true }));
    return () => {
      window.clearTimeout(timeout);
      pending.current = null;
      cancelAnimationFrame(frame.current);
      events.forEach((event) => scroll?.removeEventListener(event, release));
    };
  }, [frame, pending, position, saved, scrollRef]);
  return pinned;
}

function usePageLayoutCorrection(refs: PositionRefs, width: number) {
  const { frame, pending, saved, scrollRef } = refs;
  return useCallback((page: number) => {
    const target = pending.current;
    if (!target || target.page !== page) return;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (pending.current !== target) return;
      const scroll = scrollRef.current;
      const row = scroll?.querySelector<HTMLElement>(`[data-list-position-index="${page - 1}"]`);
      if (!scroll || !row) return;
      if (Date.now() > target.until || target.attempts++ >= 6) { pending.current = null; return; }
      const rect = row.getBoundingClientRect();
      const offset = target.fraction * rect.height;
      const top = rect.top - scroll.getBoundingClientRect().top + scroll.scrollTop + offset;
      scroll.scrollTo({ top: Math.max(0, top) });
      saved.current = { anchor: { index: page - 1, key: String(page), offset, order: [] }, fraction: target.fraction, width };
    });
  }, [frame, pending, saved, scrollRef, width]);
}

// Only this viewer's current page is retained; no PDF resource is owned here.
export function useSimplePdfPosition(scrollRef: RefObject<HTMLDivElement | null>, width: number, initialPage: number, persistence?: SimplePdfPositionPersistence) {
  const latestPersistence = useRef(persistence);
  latestPersistence.current = persistence;
  const saved = useRef<SavedPage>();
  const pending = useRef<PendingPage | null>(null);
  const frame = useRef(0);
  const refs = { frame, pending, saved, scrollRef, persistence: latestPersistence };
  const position = usePagePosition(refs, width, initialPage);
  const pinned = usePagePositionLifetime(refs, position, initialPage);
  const onLayoutReady = usePageLayoutCorrection(refs, width);
  return { onLayoutReady, pinned, position };
}

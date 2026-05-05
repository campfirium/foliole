import { useCallback, useRef, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';

import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';

interface ScrollMetrics {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

interface ScrollbarState {
  maxScrollTop: number;
  showScrollbar: boolean;
  thumbStyle: { height: string; transform: string };
  thumbRange: number;
}

const SCROLLBAR_GAP = 4;
const SCROLLBAR_MIN_THUMB_HEIGHT = 36;
const EMPTY_SCROLL_METRICS: ScrollMetrics = { clientHeight: 0, scrollHeight: 0, scrollTop: 0 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function useEditorScrollbarMetrics(adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>) {
  const syncScrollMetrics = useCallback(() => {
    adapterRef.current?.getScrollMetrics();
  }, [adapterRef]);

  return { scrollMetrics: EMPTY_SCROLL_METRICS, syncScrollMetrics };
}

export function useScrollbarState(scrollMetrics: ScrollMetrics): ScrollbarState {
  const maxScrollTop = Math.max(0, scrollMetrics.scrollHeight - scrollMetrics.clientHeight);
  const showScrollbar = maxScrollTop > 1;
  const usableTrackHeight = Math.max(0, scrollMetrics.clientHeight - SCROLLBAR_GAP * 2);
  const thumbHeight = showScrollbar
    ? clamp((scrollMetrics.clientHeight / scrollMetrics.scrollHeight) * usableTrackHeight, SCROLLBAR_MIN_THUMB_HEIGHT, usableTrackHeight)
    : 0;
  const thumbRange = Math.max(0, usableTrackHeight - thumbHeight);
  const thumbTop = showScrollbar && maxScrollTop > 0 ? SCROLLBAR_GAP + (scrollMetrics.scrollTop / maxScrollTop) * thumbRange : SCROLLBAR_GAP;

  return {
    maxScrollTop,
    showScrollbar,
    thumbRange,
    thumbStyle: { height: `${thumbHeight}px`, transform: `translateY(${thumbTop}px)` }
  };
}

export function useTrackPointerHandler(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  hostRef: MutableRefObject<HTMLDivElement | null>,
  scrollbar: ScrollbarState,
  syncScrollMetrics: () => void
) {
  return useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const adapter = adapterRef.current;
      const host = hostRef.current;
      if (!adapter || !host || !scrollbar.showScrollbar) {
        return;
      }
      event.preventDefault();
      const trackY = clamp(event.clientY - host.getBoundingClientRect().top - SCROLLBAR_GAP, 0, scrollbar.thumbRange);
      adapter.setScrollTop(scrollbar.thumbRange > 0 ? (trackY / scrollbar.thumbRange) * scrollbar.maxScrollTop : 0);
      syncScrollMetrics();
    },
    [adapterRef, hostRef, scrollbar, syncScrollMetrics]
  );
}

export function useThumbPointerHandlers(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  scrollMetrics: ScrollMetrics,
  scrollbar: ScrollbarState,
  syncScrollMetrics: () => void
) {
  const dragStateRef = useRef<{ pointerId: number; startY: number; startScrollTop: number } | null>(null);

  const onThumbPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!scrollbar.showScrollbar) {
        return;
      }
      event.preventDefault();
      dragStateRef.current = { pointerId: event.pointerId, startY: event.clientY, startScrollTop: scrollMetrics.scrollTop };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [scrollMetrics.scrollTop, scrollbar.showScrollbar]
  );

  const onThumbPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      const adapter = adapterRef.current;
      if (!dragState || !adapter || dragState.pointerId !== event.pointerId || scrollbar.thumbRange <= 0 || scrollbar.maxScrollTop <= 0) {
        return;
      }
      event.preventDefault();
      const deltaY = event.clientY - dragState.startY;
      const nextScrollTop = clamp(dragState.startScrollTop + (deltaY * scrollbar.maxScrollTop) / scrollbar.thumbRange, 0, scrollbar.maxScrollTop);
      adapter.setScrollTop(nextScrollTop);
      syncScrollMetrics();
    },
    [adapterRef, scrollbar.maxScrollTop, scrollbar.thumbRange, syncScrollMetrics]
  );

  const onThumbPointerRelease = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return { onThumbPointerDown, onThumbPointerMove, onThumbPointerRelease };
}

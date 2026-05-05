import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent
} from 'react';

import { clearDebugEditorAdapter, registerDebugEditorAdapter } from '../../../shared/testing/debugBridge';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorAdapter } from '../adapters/EditorAdapter';

interface EditorViewState {
  scrollTop: number;
  selection: {
    from: number;
    to: number;
  };
}

interface MarkdownEditorProps {
  ariaLabel?: string;
  className?: string;
  debugId?: string;
  nodeId: string | null;
  nodeViewState?: EditorViewState;
  value: string;
  onChange: (value: string) => void;
  onReady?: (adapter: EditorAdapter | null) => void;
}

interface ScrollMetrics {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
}

interface ScrollbarState {
  maxScrollTop: number;
  showScrollbar: boolean;
  thumbRange: number;
  thumbStyle: { height: string; transform: string };
}

const SCROLLBAR_GAP = 4;
const SCROLLBAR_MIN_THUMB_HEIGHT = 36;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function useEditorAdapter(
  hostRef: MutableRefObject<HTMLDivElement | null>,
  debugId: string | undefined,
  onChange: (value: string) => void,
  onReady: ((adapter: EditorAdapter | null) => void) | undefined,
  value: string
) {
  const adapterRef = useRef<CodeMirrorEditorAdapter | null>(null);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);

  onChangeRef.current = onChange;
  onReadyRef.current = onReady;

  useEffect(() => {
    const host = hostRef.current;
    if (!host || adapterRef.current) {
      return;
    }

    const adapter = new CodeMirrorEditorAdapter(host, {
      initialContent: value,
      onChange: (nextValue) => onChangeRef.current(nextValue)
    });

    adapterRef.current = adapter;
    if (debugId) {
      registerDebugEditorAdapter(debugId, adapter);
    }
    onReadyRef.current?.(adapter);

    return () => {
      onReadyRef.current?.(null);
      if (debugId) {
        clearDebugEditorAdapter(debugId);
      }
      adapter.destroy();
      adapterRef.current = null;
    };
  }, [debugId, hostRef, value]);

  return adapterRef;
}

function useEditorScrollbarMetrics(adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>) {
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>({
    clientHeight: 0,
    scrollHeight: 0,
    scrollTop: 0
  });

  const syncScrollMetrics = useCallback(() => {
    const adapter = adapterRef.current;
    if (!adapter) {
      return;
    }
    setScrollMetrics(adapter.getScrollMetrics());
  }, [adapterRef]);

  return {
    scrollMetrics,
    syncScrollMetrics
  };
}

function useEditorLayoutEffects(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  hostRef: MutableRefObject<HTMLDivElement | null>,
  nodeId: string | null,
  nodeViewState: EditorViewState | undefined,
  syncScrollMetrics: () => void,
  value: string
) {
  useEffect(() => {
    const adapter = adapterRef.current;
    const host = hostRef.current;
    if (!adapter || !host) {
      return;
    }

    const unsubscribeScroll = adapter.onScroll(syncScrollMetrics);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => syncScrollMetrics()) : null;
    resizeObserver?.observe(host);
    requestAnimationFrame(syncScrollMetrics);

    return () => {
      unsubscribeScroll();
      resizeObserver?.disconnect();
    };
  }, [adapterRef, hostRef, syncScrollMetrics]);

  useEffect(() => {
    adapterRef.current?.setContent(value);
    requestAnimationFrame(syncScrollMetrics);
  }, [adapterRef, syncScrollMetrics, value]);

  useEffect(() => {
    if (!nodeId || !nodeViewState) {
      return;
    }
    const adapter = adapterRef.current;
    if (!adapter) {
      return;
    }
    adapter.setSelection(nodeViewState.selection);
    adapter.setScrollTop(nodeViewState.scrollTop);
    requestAnimationFrame(syncScrollMetrics);
  }, [adapterRef, nodeId, nodeViewState, syncScrollMetrics]);
}

function useScrollbarState(scrollMetrics: ScrollMetrics): ScrollbarState {
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
    thumbStyle: {
      height: `${thumbHeight}px`,
      transform: `translateY(${thumbTop}px)`
    }
  };
}

function useTrackPointerHandler(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  hostRef: MutableRefObject<HTMLDivElement | null>,
  scrollbar: ScrollbarState,
  syncScrollMetrics: () => void
){
  return useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const adapter = adapterRef.current;
      const host = hostRef.current;
      if (!adapter || !host || !scrollbar.showScrollbar) {
        return;
      }
      event.preventDefault();
      const hostRect = host.getBoundingClientRect();
      const trackY = clamp(event.clientY - hostRect.top - SCROLLBAR_GAP, 0, scrollbar.thumbRange);
      adapter.setScrollTop(scrollbar.thumbRange > 0 ? (trackY / scrollbar.thumbRange) * scrollbar.maxScrollTop : 0);
      syncScrollMetrics();
    },
    [adapterRef, hostRef, scrollbar, syncScrollMetrics]
  );
}

function useThumbPointerHandlers(
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
      const nextScrollTop = clamp(
        dragState.startScrollTop + (deltaY * scrollbar.maxScrollTop) / scrollbar.thumbRange,
        0,
        scrollbar.maxScrollTop
      );
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

  return {
    onThumbPointerDown,
    onThumbPointerMove,
    onThumbPointerRelease
  };
}

export function MarkdownEditor({ ariaLabel, className, debugId, nodeId, nodeViewState, value, onChange, onReady }: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useEditorAdapter(hostRef, debugId, onChange, onReady, value);
  const { scrollMetrics, syncScrollMetrics } = useEditorScrollbarMetrics(adapterRef);

  useEditorLayoutEffects(adapterRef, hostRef, nodeId, nodeViewState, syncScrollMetrics, value);

  const scrollbar = useScrollbarState(scrollMetrics);
  const thumbStyle = useMemo(() => scrollbar.thumbStyle, [scrollbar.thumbStyle]);
  const onTrackPointerDown = useTrackPointerHandler(adapterRef, hostRef, scrollbar, syncScrollMetrics);
  const handlers = useThumbPointerHandlers(adapterRef, scrollMetrics, scrollbar, syncScrollMetrics);

  return (
    <div className="relative h-full w-full">
      <div aria-label={ariaLabel} className={className ? `markdown-editor-host ${className}` : 'markdown-editor-host'} ref={hostRef} />
      {scrollbar.showScrollbar ? (
        <div aria-hidden="true" className="editor-scrollbar-track" onPointerDown={onTrackPointerDown}>
          <div
            className="editor-scrollbar-thumb"
            onPointerCancel={handlers.onThumbPointerRelease}
            onPointerDown={handlers.onThumbPointerDown}
            onPointerMove={handlers.onThumbPointerMove}
            onPointerUp={handlers.onThumbPointerRelease}
            style={thumbStyle}
          />
        </div>
      ) : null}
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

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
const SCROLLBAR_GAP = 4;
const SCROLLBAR_MIN_THUMB_HEIGHT = 36;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
export function MarkdownEditor({
  ariaLabel,
  className,
  debugId,
  nodeId,
  nodeViewState,
  value,
  onChange,
  onReady
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useRef<CodeMirrorEditorAdapter | null>(null);
  const dragStateRef = useRef<{ pointerId: number; startY: number; startScrollTop: number } | null>(null);
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  const [scrollMetrics, setScrollMetrics] = useState({
    clientHeight: 0,
    scrollHeight: 0,
    scrollTop: 0
  });

  onChangeRef.current = onChange;
  onReadyRef.current = onReady;

  const syncScrollMetrics = useCallback(() => {
    const adapter = adapterRef.current;
    if (!adapter) {
      return;
    }
    setScrollMetrics(adapter.getScrollMetrics());
  }, []);

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
    const unsubscribeScroll = adapter.onScroll(syncScrollMetrics);
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => syncScrollMetrics()) : null;
    resizeObserver?.observe(host);
    requestAnimationFrame(syncScrollMetrics);

    if (debugId) {
      registerDebugEditorAdapter(debugId, adapter);
    }
    onReadyRef.current?.(adapter);
    return () => {
      unsubscribeScroll();
      resizeObserver?.disconnect();
      onReadyRef.current?.(null);
      if (debugId) {
        clearDebugEditorAdapter(debugId);
      }
      adapter.destroy();
      adapterRef.current = null;
    };
  }, [debugId]);

  useEffect(() => {
    adapterRef.current?.setContent(value);
    requestAnimationFrame(syncScrollMetrics);
  }, [value]);

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
  }, [nodeId, nodeViewState]);

  const maxScrollTop = Math.max(0, scrollMetrics.scrollHeight - scrollMetrics.clientHeight);
  const showScrollbar = maxScrollTop > 1;
  const usableTrackHeight = Math.max(0, scrollMetrics.clientHeight - SCROLLBAR_GAP * 2);
  const thumbHeight = showScrollbar
    ? clamp((scrollMetrics.clientHeight / scrollMetrics.scrollHeight) * usableTrackHeight, SCROLLBAR_MIN_THUMB_HEIGHT, usableTrackHeight)
    : 0;
  const thumbRange = Math.max(0, usableTrackHeight - thumbHeight);
  const thumbTop = showScrollbar && maxScrollTop > 0 ? SCROLLBAR_GAP + (scrollMetrics.scrollTop / maxScrollTop) * thumbRange : SCROLLBAR_GAP;

  const thumbStyle = useMemo(
    () => ({
      height: `${thumbHeight}px`,
      transform: `translateY(${thumbTop}px)`
    }),
    [thumbHeight, thumbTop]
  );

  const jumpToPointerPosition = useCallback(
    (pointerY: number) => {
      const adapter = adapterRef.current;
      const host = hostRef.current;
      if (!adapter || !host || !showScrollbar) {
        return;
      }

      const hostRect = host.getBoundingClientRect();
      const trackY = clamp(pointerY - hostRect.top - SCROLLBAR_GAP, 0, thumbRange);
      const nextScrollTop = thumbRange > 0 ? (trackY / thumbRange) * maxScrollTop : 0;
      adapter.setScrollTop(nextScrollTop);
      syncScrollMetrics();
    },
    [maxScrollTop, showScrollbar, syncScrollMetrics, thumbRange]
  );

  const onTrackPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!showScrollbar) {
        return;
      }
      event.preventDefault();
      jumpToPointerPosition(event.clientY);
    },
    [jumpToPointerPosition, showScrollbar]
  );

  const onThumbPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!showScrollbar) {
        return;
      }
      event.preventDefault();
      dragStateRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startScrollTop: scrollMetrics.scrollTop
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [scrollMetrics.scrollTop, showScrollbar]
  );

  const onThumbPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const dragState = dragStateRef.current;
      const adapter = adapterRef.current;
      if (!dragState || !adapter || dragState.pointerId !== event.pointerId || thumbRange <= 0 || maxScrollTop <= 0) {
        return;
      }

      event.preventDefault();
      const deltaY = event.clientY - dragState.startY;
      const nextScrollTop = clamp(dragState.startScrollTop + (deltaY * maxScrollTop) / thumbRange, 0, maxScrollTop);
      adapter.setScrollTop(nextScrollTop);
      syncScrollMetrics();
    },
    [maxScrollTop, syncScrollMetrics, thumbRange]
  );

  const onThumbPointerRelease = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId === event.pointerId) {
      dragStateRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);
  const hostClassName = className ? `markdown-editor-host ${className}` : 'markdown-editor-host';

  return (
    <div className="relative h-full w-full">
      <div aria-label={ariaLabel} className={hostClassName} ref={hostRef} />
      {showScrollbar ? (
        <div aria-hidden="true" className="editor-scrollbar-track" onPointerDown={onTrackPointerDown}>
          <div
            className="editor-scrollbar-thumb"
            onPointerCancel={onThumbPointerRelease}
            onPointerDown={onThumbPointerDown}
            onPointerMove={onThumbPointerMove}
            onPointerUp={onThumbPointerRelease}
            style={thumbStyle}
          />
        </div>
      ) : null}
    </div>
  );
}

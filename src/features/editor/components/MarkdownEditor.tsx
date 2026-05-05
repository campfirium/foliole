import { type CSSProperties, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent, type MutableRefObject } from 'react';

import { clearDebugEditorAdapter, registerDebugEditorAdapter } from '../../../shared/testing/debugBridge';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorAdapter } from '../adapters/EditorAdapter';
import { DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS, type EditorMouseGestureBinding } from '../model/editorMouseGestures';

import { useEditorScrollbarMetrics, useScrollbarState, useThumbPointerHandlers, useTrackPointerHandler } from './markdownEditorScrollbar';
import { useEditorMouseGesture } from './useEditorMouseGesture';

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
  contentPaddingBottom?: string;
  debugId?: string;
  nodeId: string | null;
  nodeViewState?: EditorViewState;
  value: string;
  onChange: (value: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onReady?: (adapter: EditorAdapter | null) => void;
  mouseGestureBindings?: EditorMouseGestureBinding[];
}

function useEditorAdapter(
  hostRef: MutableRefObject<HTMLDivElement | null>,
  debugId: string | undefined,
  onChange: (value: string) => void,
  onReady: ((adapter: EditorAdapter | null) => void) | undefined,
  initialValue: string
) {
  const adapterRef = useRef<CodeMirrorEditorAdapter | null>(null);
  const initialValueRef = useRef(initialValue);
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
      initialContent: initialValueRef.current,
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
  }, [debugId, hostRef]);

  return adapterRef;
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

function buildGestureTrailPath(points: { x: number; y: number }[]) {
  if (points.length < 2) {
    return '';
  }
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function GestureTrailOverlay({
  path,
  trail
}: {
  path: string;
  trail: { height: number; width: number } | null;
}) {
  if (!trail || !path) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20 text-foreground/25"
      height={trail.height}
      viewBox={`0 0 ${trail.width} ${trail.height}`}
      width={trail.width}
    >
      <path
        d={path}
        data-editor-gesture-trail="true"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  );
}

export function MarkdownEditor({
  ariaLabel,
  className,
  contentPaddingBottom,
  debugId,
  nodeId,
  nodeViewState,
  value,
  onChange,
  onContextMenu,
  mouseGestureBindings = DEFAULT_EDITOR_MOUSE_GESTURE_BINDINGS,
  onReady
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useEditorAdapter(hostRef, debugId, onChange, onReady, value);
  const { scrollMetrics, syncScrollMetrics } = useEditorScrollbarMetrics(adapterRef);

  useEditorLayoutEffects(adapterRef, hostRef, nodeId, nodeViewState, syncScrollMetrics, value);

  const scrollbar = useScrollbarState(scrollMetrics);
  const thumbStyle = useMemo(() => scrollbar.thumbStyle, [scrollbar.thumbStyle]);
  const onTrackPointerDown = useTrackPointerHandler(adapterRef, hostRef, scrollbar, syncScrollMetrics);
  const handlers = useThumbPointerHandlers(adapterRef, scrollMetrics, scrollbar, syncScrollMetrics);
  const mouseGesture = useEditorMouseGesture(adapterRef, hostRef, mouseGestureBindings);
  const editorStyle = { '--editor-content-padding-bottom': contentPaddingBottom } as CSSProperties;
  const gestureTrailPath = useMemo(() => buildGestureTrailPath(mouseGesture.trail?.points ?? []), [mouseGesture.trail?.points]);

  return (
    <div
      className="relative h-full w-full"
      onContextMenu={(event) => mouseGesture.handleContextMenu(event, onContextMenu)}
      onMouseDownCapture={mouseGesture.handleMouseDownCapture}
      style={editorStyle}
    >
      <div aria-label={ariaLabel} className={className ? `markdown-editor-host ${className}` : 'markdown-editor-host'} ref={hostRef} />
      <GestureTrailOverlay path={gestureTrailPath} trail={mouseGesture.trail} />
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

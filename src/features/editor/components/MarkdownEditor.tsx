import { type CSSProperties, useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent, type MutableRefObject } from 'react';

import { clearDebugEditorAdapter, registerDebugEditorAdapter } from '../../../shared/testing/debugBridge';
import { useMouseGestureSettings } from '../../settings/context/MouseGestureSettingsProvider';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorAdapter, EditorDiffDecorations } from '../adapters/EditorAdapter';

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
  contentPaddingRight?: string;
  debugId?: string;
  hideTitleHeading?: boolean;
  hideScrollbar?: boolean;
  lineDiffDecorations?: EditorDiffDecorations | null;
  nodeId: string | null;
  nodeViewState?: EditorViewState;
  readOnly?: boolean;
  value: string;
  onChange: (value: string) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onReady?: (adapter: EditorAdapter | null) => void;
}

function useEditorAdapter(
  hostRef: MutableRefObject<HTMLDivElement | null>,
  debugId: string | undefined,
  onChange: (value: string) => void,
  onReady: ((adapter: EditorAdapter | null) => void) | undefined,
  initialValue: string,
  hideTitleHeading: boolean,
  readOnly: boolean | undefined
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
      hideTitleHeading,
      initialContent: initialValueRef.current,
      onChange: (nextValue) => onChangeRef.current(nextValue),
      readOnly
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
  }, [debugId, hostRef, readOnly]);

  return adapterRef;
}

function useEditorLayoutEffects(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  hostRef: MutableRefObject<HTMLDivElement | null>,
  nodeId: string | null,
  nodeViewState: EditorViewState | undefined,
  syncScrollMetrics: () => void,
  value: string,
  hideTitleHeading: boolean,
  lineDiffDecorations: EditorDiffDecorations | null | undefined
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
    adapterRef.current?.setDiffDecorations(lineDiffDecorations ?? null);
    requestAnimationFrame(syncScrollMetrics);
  }, [adapterRef, lineDiffDecorations, syncScrollMetrics]);

  useEffect(() => {
    adapterRef.current?.setHideTitleHeading(hideTitleHeading);
  }, [adapterRef, hideTitleHeading]);

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
  trail: { color: string; height: number; lineWidth: number; opacity: number; width: number } | null;
}) {
  if (!trail || !path) {
    return null;
  }

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-20"
      height={trail.height}
      viewBox={`0 0 ${trail.width} ${trail.height}`}
      width={trail.width}
    >
      <path
        d={path}
        data-editor-gesture-trail="true"
        fill="none"
        stroke={trail.color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={trail.opacity}
        strokeWidth={trail.lineWidth}
      />
    </svg>
  );
}

export function MarkdownEditor({
  ariaLabel,
  className,
  contentPaddingBottom,
  contentPaddingRight,
  debugId,
  hideTitleHeading = false,
  hideScrollbar = false,
  lineDiffDecorations,
  nodeId,
  nodeViewState,
  readOnly,
  value,
  onChange,
  onContextMenu,
  onReady
}: MarkdownEditorProps) {
  const { bindings, settings } = useMouseGestureSettings();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useEditorAdapter(hostRef, debugId, onChange, onReady, value, hideTitleHeading, readOnly);
  const { scrollMetrics, syncScrollMetrics } = useEditorScrollbarMetrics(adapterRef);

  useEditorLayoutEffects(adapterRef, hostRef, nodeId, nodeViewState, syncScrollMetrics, value, hideTitleHeading, lineDiffDecorations);

  const scrollbar = useScrollbarState(scrollMetrics);
  const thumbStyle = useMemo(() => scrollbar.thumbStyle, [scrollbar.thumbStyle]);
  const onTrackPointerDown = useTrackPointerHandler(adapterRef, hostRef, scrollbar, syncScrollMetrics);
  const handlers = useThumbPointerHandlers(adapterRef, scrollMetrics, scrollbar, syncScrollMetrics);
  const mouseGesture = useEditorMouseGesture(adapterRef, hostRef, bindings, settings);
  const editorStyle = {
    '--editor-content-padding-bottom': contentPaddingBottom,
    '--editor-content-padding-right': contentPaddingRight
  } as CSSProperties;
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
      {scrollbar.showScrollbar && !hideScrollbar ? (
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

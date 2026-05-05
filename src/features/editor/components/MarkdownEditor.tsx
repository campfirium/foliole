import {
  type CSSProperties,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject
} from 'react';

import { clearDebugEditorAdapter, registerDebugEditorAdapter } from '../../../shared/testing/debugBridge';
import { IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT } from '../../image-cloze/model/imageClozePresentation';
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
  blockImageMaxHeightOverride?: number;
  className?: string;
  contentPaddingBottom?: string;
  fitBlockImagesToViewport?: boolean;
  debugId?: string;
  hideTitleHeading?: boolean;
  hideScrollbar?: boolean;
  lineDiffDecorations?: EditorDiffDecorations | null;
  nodeId: string | null;
  nodeViewState?: EditorViewState;
  readOnly?: boolean;
  value: string;
  onChange: (value: string) => void;
  onImageLoadStateChange?: (state: { loadedCount: number; totalCount: number }) => void;
  onContextMenu?: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onFitBlockImageMetricsChange?: (metrics: { imageCount: number; nonImageHeight: number } | null) => void;
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

  useLayoutEffect(() => {
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

  const lastRestoredSelectionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!nodeId || !nodeViewState) {
      lastRestoredSelectionKeyRef.current = null;
      return;
    }
    const adapter = adapterRef.current;
    if (!adapter) {
      return;
    }
    const selectionEnd = Math.max(nodeViewState.selection.from, nodeViewState.selection.to);
    if (value.length === 0 && selectionEnd > 0) {
      return;
    }
    const selectionKey = `${nodeId}:${nodeViewState.selection.from}:${nodeViewState.selection.to}`;
    if (lastRestoredSelectionKeyRef.current === selectionKey) {
      return;
    }
    adapter.revealSelection(nodeViewState.selection);
    lastRestoredSelectionKeyRef.current = selectionKey;
    requestAnimationFrame(syncScrollMetrics);
  }, [adapterRef, nodeId, nodeViewState, syncScrollMetrics, value]);
}

function useEditorAppearanceEffects(
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>,
  hideTitleHeading: boolean,
  nodeId: string | null
) {
  useLayoutEffect(() => {
    adapterRef.current?.setHideTitleHeading(hideTitleHeading);
  }, [adapterRef, hideTitleHeading]);

  useLayoutEffect(() => {
    if (typeof adapterRef.current?.setNodeId === 'function') {
      adapterRef.current.setNodeId(nodeId);
      adapterRef.current.refreshImageClozePresentation();
    }
  }, [adapterRef, nodeId]);

  useLayoutEffect(() => {
    if (!nodeId) {
      return;
    }
    const handlePresentationChange = (event: Event) => {
      const detail = (event as CustomEvent<{ editorNodeId?: string }>).detail;
      if (detail?.editorNodeId !== nodeId) {
        return;
      }
      adapterRef.current?.refreshImageClozePresentation();
    };
    window.addEventListener(IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT, handlePresentationChange as EventListener);
    return () => {
      window.removeEventListener(IMAGE_CLOZE_PRESENTATION_CHANGE_EVENT, handlePresentationChange as EventListener);
    };
  }, [adapterRef, nodeId]);
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
  blockImageMaxHeightOverride,
  className,
  contentPaddingBottom,
  fitBlockImagesToViewport = false,
  debugId,
  hideTitleHeading = false,
  hideScrollbar = false,
  lineDiffDecorations,
  nodeId,
  nodeViewState,
  readOnly,
  value,
  onChange,
  onImageLoadStateChange,
  onContextMenu,
  onFitBlockImageMetricsChange,
  onReady
}: MarkdownEditorProps) {
  const { bindings, settings } = useMouseGestureSettings();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useEditorAdapter(hostRef, debugId, onChange, onReady, value, hideTitleHeading, readOnly);
  const { scrollMetrics, syncScrollMetrics } = useEditorScrollbarMetrics(adapterRef);
  const [imageMaxHeight, setImageMaxHeight] = useState<string | undefined>(undefined);

  useEditorLayoutEffects(adapterRef, hostRef, nodeId, nodeViewState, syncScrollMetrics, value, hideTitleHeading, lineDiffDecorations);
  useEditorAppearanceEffects(adapterRef, hideTitleHeading, nodeId);

  const scrollbar = useScrollbarState(scrollMetrics);
  const thumbStyle = useMemo(() => scrollbar.thumbStyle, [scrollbar.thumbStyle]);
  const onTrackPointerDown = useTrackPointerHandler(adapterRef, hostRef, scrollbar, syncScrollMetrics);
  const handlers = useThumbPointerHandlers(adapterRef, scrollMetrics, scrollbar, syncScrollMetrics);
  const mouseGesture = useEditorMouseGesture(adapterRef, hostRef, bindings, settings);
  const editorStyle = {
    '--editor-content-padding-bottom': contentPaddingBottom,
    '--editor-image-max-height':
      typeof blockImageMaxHeightOverride === 'number' ? `${blockImageMaxHeightOverride}px` : imageMaxHeight
  } as CSSProperties;
  const gestureTrailPath = useMemo(() => buildGestureTrailPath(mouseGesture.trail?.points ?? []), [mouseGesture.trail?.points]);

  useLayoutEffect(() => {
    if (!fitBlockImagesToViewport || !rootRef.current) {
      setImageMaxHeight(undefined);
      onFitBlockImageMetricsChange?.(null);
      return;
    }
    const element = rootRef.current;
    const host = hostRef.current;
    let frameId = 0;
    const updateHeight = () => {
      const scroller = element.querySelector('.cm-scroller') as HTMLElement | null;
      const imageElements = Array.from(element.querySelectorAll('.cm-md-image-element-block')) as HTMLElement[];
      if (!scroller || imageElements.length === 0) {
        setImageMaxHeight(undefined);
        onFitBlockImageMetricsChange?.(null);
        return;
      }
      const totalImageHeight = imageElements.reduce((sum, image) => sum + image.getBoundingClientRect().height, 0);
      const nonImageHeight = Math.max(0, scroller.scrollHeight - totalImageHeight);
      const nextHeight = Math.max(120, Math.floor((scroller.clientHeight - nonImageHeight - 8) / imageElements.length));
      onFitBlockImageMetricsChange?.({
        imageCount: imageElements.length,
        nonImageHeight
      });
      setImageMaxHeight((current) => {
        const nextValue = `${nextHeight}px`;
        return current === nextValue ? current : nextValue;
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updateHeight);
    };
    const handleImageLoad = (event: Event) => {
      if (event.target instanceof HTMLImageElement && event.target.classList.contains('cm-md-image-element-block')) {
        schedule();
      }
    };
    const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
    resizeObserver?.observe(element);
    if (host) {
      resizeObserver?.observe(host);
    }
    element.addEventListener('load', handleImageLoad, true);
    schedule();
    return () => {
      cancelAnimationFrame(frameId);
      element.removeEventListener('load', handleImageLoad, true);
      resizeObserver?.disconnect();
    };
  }, [fitBlockImagesToViewport, nodeId, onFitBlockImageMetricsChange, value]);

  useEffect(() => {
    if (!rootRef.current) {
      onImageLoadStateChange?.({ loadedCount: 0, totalCount: 0 });
      return;
    }

    const element = rootRef.current;
    let frameId = 0;
    const reportState = () => {
      const images = Array.from(element.querySelectorAll('.cm-md-image-element-block')) as HTMLImageElement[];
      onImageLoadStateChange?.({
        loadedCount: images.filter((image) => image.complete).length,
        totalCount: images.length
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(reportState);
    };
    const handleImageEvent = (event: Event) => {
      if (event.target instanceof HTMLImageElement && event.target.classList.contains('cm-md-image-element-block')) {
        schedule();
      }
    };

    schedule();
    element.addEventListener('error', handleImageEvent, true);
    element.addEventListener('load', handleImageEvent, true);

    return () => {
      cancelAnimationFrame(frameId);
      element.removeEventListener('error', handleImageEvent, true);
      element.removeEventListener('load', handleImageEvent, true);
    };
  }, [nodeId, onImageLoadStateChange, value]);

  return (
    <div
      className="relative h-full w-full"
      onContextMenu={(event) => mouseGesture.handleContextMenu(event, onContextMenu)}
      onMouseDownCapture={mouseGesture.handleMouseDownCapture}
      ref={rootRef}
      style={editorStyle}
    >
      <div
        aria-label={ariaLabel}
        className={className ? `markdown-editor-host ${className}` : 'markdown-editor-host'}
        data-fit-block-images={fitBlockImagesToViewport ? 'true' : 'false'}
        ref={hostRef}
      />
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

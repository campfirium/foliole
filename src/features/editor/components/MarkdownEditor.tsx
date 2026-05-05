import {
  type CSSProperties,
  useLayoutEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type MutableRefObject
} from 'react';

import { collectMarkdownImageReferences } from '../../../../lib/core/import/markdownImageReferences';
import { clearDebugEditorAdapter, registerDebugEditorAdapter } from '../../../shared/testing/debugBridge';
import { useMouseGestureSettings } from '../../settings/context/MouseGestureSettingsProvider';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';
import type { EditorAdapter } from '../adapters/EditorAdapter';

import { GestureTrailOverlay, buildGestureTrailPath } from './markdownEditorGestureTrail';
import { useMarkdownEditorImageEffects } from './markdownEditorImageEffects';
import { useEditorAppearanceEffects, useEditorLayoutEffects } from './markdownEditorLifecycle';
import { useEditorScrollbarMetrics, useScrollbarState, useThumbPointerHandlers, useTrackPointerHandler } from './markdownEditorScrollbar';
import type { MarkdownEditorProps } from './markdownEditorTypes';
import { useEditorMouseGesture } from './useEditorMouseGesture';

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
function MarkdownEditorSurface(args: {
  ariaLabel: string | undefined;
  className: string | undefined;
  editorStyle: CSSProperties;
  fitBlockImagesToViewport: boolean;
  gestureTrailPath: string;
  hideScrollbar: boolean;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  mouseGesture: ReturnType<typeof useEditorMouseGesture>;
  onContextMenu: MarkdownEditorProps['onContextMenu'];
  onTrackPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  rootRef: MutableRefObject<HTMLDivElement | null>;
  scrollbar: ReturnType<typeof useScrollbarState>;
  thumbHandlers: ReturnType<typeof useThumbPointerHandlers>;
  thumbStyle: CSSProperties;
}) {
  return (
    <div
      className="relative h-full w-full"
      onContextMenu={(event) => args.mouseGesture.handleContextMenu(event, args.onContextMenu)}
      onMouseDownCapture={args.mouseGesture.handleMouseDownCapture}
      ref={args.rootRef}
      style={args.editorStyle}
    >
      <div
        aria-label={args.ariaLabel}
        className={args.className ? `markdown-editor-host ${args.className}` : 'markdown-editor-host'}
        data-fit-block-images={args.fitBlockImagesToViewport ? 'true' : 'false'}
        ref={args.hostRef}
      />
      <GestureTrailOverlay path={args.gestureTrailPath} trail={args.mouseGesture.trail} />
      {args.scrollbar.showScrollbar && !args.hideScrollbar ? (
        <div aria-hidden="true" className="editor-scrollbar-track" onPointerDown={args.onTrackPointerDown}>
          <div
            className="editor-scrollbar-thumb"
            onPointerCancel={args.thumbHandlers.onThumbPointerRelease}
            onPointerDown={args.thumbHandlers.onThumbPointerDown}
            onPointerMove={args.thumbHandlers.onThumbPointerMove}
            onPointerUp={args.thumbHandlers.onThumbPointerRelease}
            style={args.thumbStyle}
          />
        </div>
      ) : null}
    </div>
  );
}

function useMarkdownEditorSurfaceModel(args: {
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>;
  bindings: ReturnType<typeof useMouseGestureSettings>['bindings'];
  blockImageMaxHeightOverride: number | undefined;
  contentPaddingBottom: string | undefined;
  fitBlockImagesToViewport: boolean;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  nodeId: string | null;
  onFitBlockImageMetricsChange: MarkdownEditorProps['onFitBlockImageMetricsChange'];
  onImageLoadStateChange: MarkdownEditorProps['onImageLoadStateChange'];
  rootRef: MutableRefObject<HTMLDivElement | null>;
  settings: ReturnType<typeof useMouseGestureSettings>['settings'];
  syncScrollMetrics: () => void;
  value: string;
}) {
  const { scrollMetrics } = useEditorScrollbarMetrics(args.adapterRef);
  const scrollbar = useScrollbarState(scrollMetrics);
  const thumbStyle = useMemo(() => scrollbar.thumbStyle, [scrollbar.thumbStyle]);
  const onTrackPointerDown = useTrackPointerHandler(args.adapterRef, args.hostRef, scrollbar, args.syncScrollMetrics);
  const thumbHandlers = useThumbPointerHandlers(args.adapterRef, scrollMetrics, scrollbar, args.syncScrollMetrics);
  const mouseGesture = useEditorMouseGesture(args.adapterRef, args.hostRef, args.bindings, args.settings);
  const hasMarkdownImages = useMemo(
    () => args.value.includes('![') && args.value.includes('](') && collectMarkdownImageReferences(args.value).length > 0,
    [args.value]
  );
  const imageMaxHeight = useMarkdownEditorImageEffects({
    fitBlockImagesToViewport: args.fitBlockImagesToViewport,
    hostRef: args.hostRef,
    hasMarkdownImages,
    nodeId: args.nodeId,
    onFitBlockImageMetricsChange: args.onFitBlockImageMetricsChange,
    onImageLoadStateChange: args.onImageLoadStateChange,
    rootRef: args.rootRef,
    value: args.value
  });
  const editorStyle = {
    '--editor-content-padding-bottom': args.contentPaddingBottom,
    '--editor-image-max-height':
      typeof args.blockImageMaxHeightOverride === 'number' ? `${args.blockImageMaxHeightOverride}px` : imageMaxHeight
  } as CSSProperties;
  const gestureTrailPath = useMemo(() => buildGestureTrailPath(mouseGesture.trail?.points ?? []), [mouseGesture.trail?.points]);

  return { editorStyle, gestureTrailPath, mouseGesture, onTrackPointerDown, scrollbar, thumbHandlers, thumbStyle };
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
  const hostRef = useRef<HTMLDivElement | null>(null), rootRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useEditorAdapter(hostRef, debugId, onChange, onReady, value, hideTitleHeading, readOnly);
  const syncScrollMetrics = useEditorScrollbarMetrics(adapterRef).syncScrollMetrics;
  useEditorLayoutEffects(adapterRef, hostRef, nodeId, nodeViewState, syncScrollMetrics, value, lineDiffDecorations);
  useEditorAppearanceEffects(adapterRef, hideTitleHeading, nodeId);
  const surface = useMarkdownEditorSurfaceModel({
    adapterRef,
    bindings,
    blockImageMaxHeightOverride,
    contentPaddingBottom,
    fitBlockImagesToViewport,
    hostRef,
    nodeId,
    onFitBlockImageMetricsChange,
    onImageLoadStateChange,
    rootRef,
    settings,
    syncScrollMetrics,
    value
  });
  return (
    <MarkdownEditorSurface
      ariaLabel={ariaLabel}
      className={className}
      editorStyle={surface.editorStyle}
      fitBlockImagesToViewport={fitBlockImagesToViewport}
      gestureTrailPath={surface.gestureTrailPath}
      hideScrollbar={hideScrollbar}
      hostRef={hostRef}
      mouseGesture={surface.mouseGesture}
      onContextMenu={onContextMenu}
      onTrackPointerDown={surface.onTrackPointerDown}
      rootRef={rootRef}
      scrollbar={surface.scrollbar}
      thumbHandlers={surface.thumbHandlers}
      thumbStyle={surface.thumbStyle}
    />
  );
}

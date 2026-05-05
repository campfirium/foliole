import {
  type CSSProperties,
  useLayoutEffect,
  useMemo,
  useRef,
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
import { useEditorScrollbarMetrics } from './markdownEditorScrollbar';
import type { MarkdownEditorProps } from './markdownEditorTypes';
import { MarkdownImagePreviewDialog } from './MarkdownImagePreviewDialog';
import { useEditorMouseGesture } from './useEditorMouseGesture';
import { useMarkdownImagePreview } from './useMarkdownImagePreview';

function useEditorAdapter(
  hostRef: MutableRefObject<HTMLDivElement | null>,
  debugId: string | undefined,
  onChange: (value: string) => void,
  onReady: ((adapter: EditorAdapter | null) => void) | undefined,
  initialValue: string,
  hiddenTextAnchorKeys: readonly string[] | undefined,
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
      hiddenTextAnchorKeys,
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

  useLayoutEffect(() => {
    adapterRef.current?.setHiddenTextAnchorKeys?.(hiddenTextAnchorKeys ?? []);
  }, [hiddenTextAnchorKeys]);

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
  rootRef: MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className="relative h-full w-full"
      onContextMenu={(event) => args.mouseGesture.handleContextMenu(event, args.onContextMenu)}
      onMouseDownCapture={args.mouseGesture.handleMouseDownCapture}
      ref={args.rootRef}
    >
      <div
        aria-label={args.ariaLabel}
        className={
          args.className
            ? `markdown-editor-host${args.hideScrollbar ? ' scrollbar-hidden' : ''} ${args.className}`
            : `markdown-editor-host${args.hideScrollbar ? ' scrollbar-hidden' : ''}`
        }
        data-fit-block-images={args.fitBlockImagesToViewport ? 'true' : 'false'}
        ref={args.hostRef}
        style={args.editorStyle}
      />
      <GestureTrailOverlay path={args.gestureTrailPath} trail={args.mouseGesture.trail} />
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
  const mouseGesture = useEditorMouseGesture(args.adapterRef, args.hostRef, args.bindings, args.settings);
  const hasMarkdownImages = useMemo(
    () => args.value.includes('![') && args.value.includes('](') && collectMarkdownImageReferences(args.value).length > 0,
    [args.value]
  );
  const { imageMaxHeight } = useMarkdownEditorImageEffects({
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

  return { editorStyle, gestureTrailPath, mouseGesture };
}

function useMarkdownEditorModel(props: MarkdownEditorProps) {
  const { bindings, settings } = useMouseGestureSettings();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const adapterRef = useEditorAdapter(
    hostRef,
    props.debugId,
    props.onChange,
    props.onReady,
    props.value,
    props.hiddenTextAnchorKeys,
    props.hideTitleHeading ?? false,
    props.readOnly
  );
  const syncScrollMetrics = useEditorScrollbarMetrics(adapterRef).syncScrollMetrics;
  const { closePreview, previewImage } = useMarkdownImagePreview(hostRef);
  useEditorLayoutEffects(
    adapterRef,
    hostRef,
    props.nodeId,
    props.nodeViewState,
    syncScrollMetrics,
    props.value,
    props.lineDiffDecorations
  );
  useEditorAppearanceEffects(adapterRef, props.hideTitleHeading ?? false, props.nodeId);
  const surface = useMarkdownEditorSurfaceModel({
    adapterRef,
    bindings,
    blockImageMaxHeightOverride: props.blockImageMaxHeightOverride,
    contentPaddingBottom: props.contentPaddingBottom,
    fitBlockImagesToViewport: props.fitBlockImagesToViewport ?? false,
    hostRef,
    nodeId: props.nodeId,
    onFitBlockImageMetricsChange: props.onFitBlockImageMetricsChange,
    onImageLoadStateChange: props.onImageLoadStateChange,
    rootRef,
    settings,
    syncScrollMetrics,
    value: props.value
  });

  return { closePreview, hostRef, previewImage, rootRef, surface };
}

export function MarkdownEditor({
  ariaLabel,
  blockImageMaxHeightOverride,
  className,
  contentPaddingBottom,
  fitBlockImagesToViewport = false,
  hiddenTextAnchorKeys,
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
  const { closePreview, hostRef, previewImage, rootRef, surface } = useMarkdownEditorModel({
    ariaLabel,
    blockImageMaxHeightOverride,
    className,
    contentPaddingBottom,
    debugId,
    fitBlockImagesToViewport,
    hiddenTextAnchorKeys,
    hideScrollbar,
    hideTitleHeading,
    lineDiffDecorations,
    nodeId,
    nodeViewState,
    onChange,
    onContextMenu,
    onFitBlockImageMetricsChange,
    onImageLoadStateChange,
    onReady,
    readOnly,
    value
  });

  return (
    <>
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
        rootRef={rootRef}
      />
      <MarkdownImagePreviewDialog image={previewImage} onOpenChange={(open) => !open && closePreview()} />
    </>
  );
}

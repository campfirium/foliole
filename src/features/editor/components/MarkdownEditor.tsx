import {
  type CSSProperties,
  useMemo,
  useRef,
  type MutableRefObject
} from 'react';

import { collectMarkdownImageReferences } from '../../../../lib/core/import/markdownImageReferences';
import { useMouseGestureSettings } from '../../settings/context/MouseGestureSettingsProvider';
import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';

import { useEditorAdapter } from './markdownEditorAdapter';
import { GestureTrailOverlay, buildGestureTrailPath } from './markdownEditorGestureTrail';
import { useMarkdownEditorImageEffects } from './markdownEditorImageEffects';
import { useEditorAppearanceEffects, useEditorLayoutEffects } from './markdownEditorLifecycle';
import type { MarkdownEditorProps } from './markdownEditorTypes';
import { MarkdownImagePreviewDialog } from './MarkdownImagePreviewDialog';
import { MarkdownTablePreviewDialog } from './MarkdownTablePreviewDialog';
import { useEditorMouseGesture } from './useEditorMouseGesture';
import { useMarkdownImagePreview } from './useMarkdownImagePreview';
import { useMarkdownTablePreview } from './useMarkdownTablePreview';

function MarkdownEditorSurface(args: {
  ariaLabel: string | undefined;
  className: string | undefined;
  editorStyle: CSSProperties;
  fitBlockImagesToViewport: boolean;
  gestureTrailPath: string;
  hideScrollbar: boolean;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  immersiveEditing: boolean;
  mouseGesture: ReturnType<typeof useEditorMouseGesture>;
  onContextMenu: MarkdownEditorProps['onContextMenu'];
  onDoubleClick: MarkdownEditorProps['onDoubleClick'];
  readOnly: boolean;
  rootRef: MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className="relative h-full w-full overflow-hidden"
      onContextMenu={(event) => args.mouseGesture.handleContextMenu(event, args.onContextMenu)}
      onDoubleClick={args.onDoubleClick}
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
        data-immersive-editing={args.immersiveEditing ? 'true' : 'false'}
        data-read-only={args.readOnly ? 'true' : 'false'}
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
  blockImageWidthOverride: string | undefined;
  contentPaddingBottom: string | undefined;
  fitBlockImagesToViewport: boolean;
  hostRef: MutableRefObject<HTMLDivElement | null>;
  nodeId: string | null;
  onFitBlockImageMetricsChange: MarkdownEditorProps['onFitBlockImageMetricsChange'];
  onImageLoadStateChange: MarkdownEditorProps['onImageLoadStateChange'];
  rootRef: MutableRefObject<HTMLDivElement | null>;
  settings: ReturnType<typeof useMouseGestureSettings>['settings'];
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
      typeof args.blockImageMaxHeightOverride === 'number' ? `${args.blockImageMaxHeightOverride}px` : imageMaxHeight,
    '--editor-image-block-width': args.blockImageWidthOverride
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
    props.textAnchorDecorations,
    props.hideTitleHeading ?? false,
    props.onMissingAttachmentResource,
    props.onOpenExternalLink,
    props.onOpenNodeLink,
    props.onPreviewNodeLink,
    props.onPastedAnchors,
    props.readOnly
  );
  const { closePreview, previewImage } = useMarkdownImagePreview(hostRef);
  const { closePreview: closeTablePreview, previewTable } = useMarkdownTablePreview(hostRef);
  useEditorLayoutEffects(
    adapterRef,
    props.nodeId,
    props.readingSelection,
    props.readingTargetViewportMode,
    props.readingTargetViewportRatio,
    props.nodeViewState,
    props.onBeginApplyingReadingPosition,
    props.onCompleteApplyingReadingPosition,
    props.onSetReadingPositionSelection,
    props.onShouldSuppressSelectionRestore,
    props.value,
    props.lineDiffDecorations
  );
  useEditorAppearanceEffects(adapterRef, props.hideTitleHeading ?? false, props.nodeId);
  const surface = useMarkdownEditorSurfaceModel({
    adapterRef,
    bindings,
    blockImageMaxHeightOverride: props.blockImageMaxHeightOverride,
    blockImageWidthOverride: props.blockImageWidthOverride,
    contentPaddingBottom: props.contentPaddingBottom,
    fitBlockImagesToViewport: props.fitBlockImagesToViewport ?? false,
    hostRef,
    nodeId: props.nodeId,
    onFitBlockImageMetricsChange: props.onFitBlockImageMetricsChange,
    onImageLoadStateChange: props.onImageLoadStateChange,
    rootRef,
    settings,
    value: props.value
  });

  return { closePreview, closeTablePreview, hostRef, previewImage, previewTable, rootRef, surface };
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  const { closePreview, closeTablePreview, hostRef, previewImage, previewTable, rootRef, surface } = useMarkdownEditorModel(props);

  return (
    <>
      <MarkdownEditorSurface
        ariaLabel={props.ariaLabel}
        className={props.className}
        editorStyle={surface.editorStyle}
        fitBlockImagesToViewport={props.fitBlockImagesToViewport ?? false}
        gestureTrailPath={surface.gestureTrailPath}
        hideScrollbar={props.hideScrollbar ?? false}
        hostRef={hostRef}
        immersiveEditing={props.immersiveEditing === true}
        mouseGesture={surface.mouseGesture}
        onContextMenu={props.onContextMenu}
        onDoubleClick={props.onDoubleClick}
        readOnly={props.readOnly === true}
        rootRef={rootRef}
      />
      <MarkdownImagePreviewDialog image={previewImage} onOpenChange={(open) => !open && closePreview()} />
      <MarkdownTablePreviewDialog table={previewTable} onOpenChange={(open) => !open && closeTablePreview()} />
    </>
  );
}

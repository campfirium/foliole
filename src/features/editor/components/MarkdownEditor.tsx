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
import {
  GestureDirectionHintOverlay,
  GestureTrailOverlay,
  buildGestureTrailPath
} from './markdownEditorGestureTrail';
import { useMarkdownEditorImageEffects } from './markdownEditorImageEffects';
import { useMarkdownEditorPropsDiagnostic } from './markdownEditorInputDiagnostic';
import { useMarkdownEditorModelEffects } from './markdownEditorModelEffects';
import { handleMarkdownEditorKeyDownCapture } from './markdownEditorReviewEscape';
import type { MarkdownEditorProps } from './markdownEditorTypes';
import { MarkdownImagePreviewDialog } from './MarkdownImagePreviewDialog';
import { MarkdownMermaidPreviewDialog } from './MarkdownMermaidPreviewDialog';
import { MarkdownTablePreviewDialog } from './MarkdownTablePreviewDialog';
import { useEditorMouseGesture } from './useEditorMouseGesture';
import { useMarkdownImagePreview } from './useMarkdownImagePreview';
import { useMarkdownMermaidPreview } from './useMarkdownMermaidPreview';
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
  onBlurCapture: MarkdownEditorProps['onBlurCapture'];
  onBeforeInputCapture: MarkdownEditorProps['onBeforeInputCapture'];
  onContextMenu: MarkdownEditorProps['onContextMenu'];
  onDoubleClick: MarkdownEditorProps['onDoubleClick'];
  onKeyDownCapture: MarkdownEditorProps['onKeyDownCapture'];
  readOnly: boolean;
  readOnlyInteractionMode: MarkdownEditorProps['readOnlyInteractionMode'];
  reviewCaretLineHighlight: boolean;
  reviewEscapeBlurEnabled: boolean;
  rootRef: MutableRefObject<HTMLDivElement | null>;
  scrollContainer: NonNullable<MarkdownEditorProps['scrollContainer']>;
}) {
  return (
    <div
      className={args.scrollContainer === 'outer' ? 'relative h-full w-full overflow-visible' : 'relative h-full w-full overflow-hidden'}
      onBeforeInputCapture={args.onBeforeInputCapture}
      onBlurCapture={args.onBlurCapture}
      onContextMenu={(event) => args.mouseGesture.handleContextMenu(event, args.onContextMenu)}
      onDoubleClick={args.onDoubleClick}
      onKeyDownCapture={args.onKeyDownCapture}
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
        data-read-only-interaction-mode={args.readOnlyInteractionMode ?? 'editor'}
        data-read-only={args.readOnly ? 'true' : 'false'}
        data-review-caret-line={args.reviewCaretLineHighlight ? 'true' : 'false'}
        data-review-escape-blur={args.reviewEscapeBlurEnabled ? 'true' : 'false'}
        data-scroll-container={args.scrollContainer}
        ref={args.hostRef}
        style={args.editorStyle}
      />
      <GestureTrailOverlay path={args.gestureTrailPath} trail={args.mouseGesture.trail} />
      <GestureDirectionHintOverlay
        commandTitle={args.mouseGesture.activeCommandTitle}
        directions={args.mouseGesture.directions}
        position={args.mouseGesture.hintPosition}
      />
    </div>
  );
}

function useMarkdownEditorSurfaceModel(args: {
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>;
  bindings: ReturnType<typeof useMouseGestureSettings>['bindings'];
  blockImageMaxHeightOverride: number | undefined;
  blockImageWidthOverride: string | undefined;
  contentPaddingTop: string | undefined;
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
  const mouseGesture = useEditorMouseGesture(args.hostRef, args.bindings, args.settings);
  const markdownImageReferences = useMemo(
    () => (args.value.includes('![') && args.value.includes('](') ? collectMarkdownImageReferences(args.value) : []),
    [args.value]
  );
  const hasMarkdownImages = markdownImageReferences.length > 0;
  const imageEffectKey = useMemo(
    () => markdownImageReferences.map((reference) => reference.fullMatch).join('\n'),
    [markdownImageReferences]
  );
  const { imageMaxHeight } = useMarkdownEditorImageEffects({
    fitBlockImagesToViewport: args.fitBlockImagesToViewport,
    hostRef: args.hostRef,
    hasMarkdownImages,
    imageEffectKey,
    nodeId: args.nodeId,
    ...(args.onFitBlockImageMetricsChange ? { onFitBlockImageMetricsChange: args.onFitBlockImageMetricsChange } : {}),
    ...(args.onImageLoadStateChange ? { onImageLoadStateChange: args.onImageLoadStateChange } : {}),
    rootRef: args.rootRef
  });
  const editorStyle = {
    '--editor-content-padding-top': args.contentPaddingTop,
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
    props.onDocumentInput,
    props.onReady,
    props.value,
    props.localDocumentPath,
    props.liveMarkdownEnabled,
    props.textAnchorDecorations,
    props.hideTitleHeading ?? false,
    props.applicationCutEnabled,
    props.onMissingAttachmentResource,
    props.onOpenExternalLink,
    props.onOpenNodeLink,
    props.onPreviewNodeLink,
    props.onPastedAnchors,
    props.onRedo,
    props.onUndo,
    props.readOnly,
    props.readOnlyInteractionMode,
    props.trailingDivider
  );
  const { closePreview, previewImage } = useMarkdownImagePreview(hostRef);
  const { closePreview: closeMermaidPreview, previewMermaid } = useMarkdownMermaidPreview(hostRef);
  const { closePreview: closeTablePreview, previewTable } = useMarkdownTablePreview(hostRef);
  useMarkdownEditorModelEffects({ adapterRef, props, rootRef });
  const surface = useMarkdownEditorSurfaceModel({
    adapterRef,
    bindings,
    blockImageMaxHeightOverride: props.blockImageMaxHeightOverride,
    blockImageWidthOverride: props.blockImageWidthOverride,
    contentPaddingTop: props.contentPaddingTop,
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

  return { closeMermaidPreview, closePreview, closeTablePreview, hostRef, previewImage, previewMermaid, previewTable, rootRef, surface };
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  useMarkdownEditorPropsDiagnostic(props);
  const { closeMermaidPreview, closePreview, closeTablePreview, hostRef, previewImage, previewMermaid, previewTable, rootRef, surface } = useMarkdownEditorModel(props);

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
        onBlurCapture={props.onBlurCapture}
        onBeforeInputCapture={props.onBeforeInputCapture}
        onContextMenu={props.onContextMenu}
        onDoubleClick={props.onDoubleClick}
        onKeyDownCapture={(event) => handleMarkdownEditorKeyDownCapture(event, props)}
        readOnly={props.readOnly === true}
        readOnlyInteractionMode={props.readOnlyInteractionMode}
        reviewCaretLineHighlight={props.reviewCaretLineHighlight === true}
        reviewEscapeBlurEnabled={props.reviewEscapeBlurEnabled === true}
        rootRef={rootRef}
        scrollContainer={props.scrollContainer ?? 'editor'}
      />
      <MarkdownImagePreviewDialog image={previewImage} onOpenChange={(open) => !open && closePreview()} />
      <MarkdownMermaidPreviewDialog diagram={previewMermaid} onOpenChange={(open) => !open && closeMermaidPreview()} />
      <MarkdownTablePreviewDialog table={previewTable} onOpenChange={(open) => !open && closeTablePreview()} />
    </>
  );
}

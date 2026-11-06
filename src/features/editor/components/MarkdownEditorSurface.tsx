import type { CSSProperties, MutableRefObject } from 'react';

import { GestureDirectionHintOverlay, GestureTrailOverlay } from './markdownEditorGestureTrail';
import type { MarkdownEditorProps } from './markdownEditorTypes';
import type { useEditorMouseGesture } from './useEditorMouseGesture';

interface MarkdownEditorSurfaceProps {
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
  onFocusCapture: MarkdownEditorProps['onFocusCapture'];
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
}

export function MarkdownEditorSurface(args: MarkdownEditorSurfaceProps) {
  return (
    <div
      className={args.scrollContainer === 'outer' ? 'relative h-full w-full overflow-visible' : 'relative h-full w-full overflow-hidden'}
      onBeforeInputCapture={args.onBeforeInputCapture}
      onBlurCapture={args.onBlurCapture}
      onFocusCapture={args.onFocusCapture}
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

import type { MutableRefObject } from 'react';

import { CodeMirrorEditorAdapter } from '../adapters/CodeMirrorEditorAdapter';

import { useEditorAppearanceEffects, useEditorLayoutEffects } from './markdownEditorLifecycle';
import { useReviewEditorEscapeBlur } from './markdownEditorReviewEscape';
import type { MarkdownEditorProps } from './markdownEditorTypes';

export function useMarkdownEditorModelEffects(args: {
  adapterRef: MutableRefObject<CodeMirrorEditorAdapter | null>;
  props: MarkdownEditorProps;
  rootRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const { adapterRef, props, rootRef } = args;
  useEditorAppearanceEffects(adapterRef, props.hideTitleHeading ?? false, props.nodeId);
  useEditorLayoutEffects(
    adapterRef,
    props.nodeId,
    props.readingRestoreCommandId,
    props.readingRestoreScrollTop,
    props.readingSelection,
    props.readingSelectionMode,
    props.readingTargetViewportMode,
    props.readingTargetViewportRatio,
    props.onBeginApplyingReadingPosition,
    props.onCompleteApplyingReadingPosition,
    props.onSetReadingPositionSelection,
    props.onShouldSuppressSelectionRestore,
    props.value,
    props.lineDiffDecorations
  );
  useReviewEditorEscapeBlur({
    enabled: props.reviewEscapeBlurEnabled === true,
    rootRef
  });
}

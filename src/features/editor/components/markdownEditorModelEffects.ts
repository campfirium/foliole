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
  useEditorLayoutEffects(
    adapterRef,
    props.nodeId,
    props.readingRestoreCommandId,
    props.readingRestoreScrollTop,
    props.readingSelection,
    props.readingTargetViewportMode,
    props.readingTargetViewportRatio,
    props.onBeginApplyingReadingPosition,
    props.onCompleteApplyingReadingPosition,
    props.onSetReadingPositionSelection,
    props.onShouldSuppressSelectionRestore,
    props.value,
    props.lineDiffDecorations
  );
  useEditorAppearanceEffects(adapterRef, props.hideTitleHeading ?? false, props.nodeId);
  useReviewEditorEscapeBlur({ enabled: props.reviewCaretLineHighlight === true, rootRef });
}

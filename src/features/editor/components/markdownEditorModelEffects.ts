import { useEffect, type MutableRefObject } from 'react';

import { definedProps } from '../../../shared/lib/definedProps';
import { requestBodyOverflow } from '../../../shared/ui/bodyOverflowRequest';
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
  useEffect(() => adapterRef.current?.onBodyOverflow?.((request) => {
    if (request.nodeId !== props.nodeId) return;
    requestBodyOverflow({ ...request,
      prepare: () => {
        if (adapterRef.current?.getContent() !== request.previousContent) return false;
        props.onChange(request.previousContent, { nodeId: request.nodeId });
        return true;
      },
      cancel: () => adapterRef.current?.focus()
    });
  }), [adapterRef, props.nodeId, props.onChange]);
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
    rootRef,
    ...definedProps({ onExitEditing: props.onExitEditing })
  });
}

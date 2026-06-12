import { type KeyboardEvent as ReactKeyboardEvent, useEffect, type MutableRefObject } from 'react';

import { dispatchReviewEditorEscapeBlur } from '../../../shared/platform/reviewEditorEscape';

import type { MarkdownEditorProps } from './markdownEditorTypes';
import { handleEditorUndoRedoKeyDown } from './markdownEditorUndoRedoShortcut';

function isReviewEditorActive(activeElement: Element) {
  return Boolean(activeElement.closest('.markdown-editor-host[data-review-escape-blur="true"]'));
}

function blurReviewEditorIfEscape(event: KeyboardEvent | ReactKeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Escape' || event.defaultPrevented) {
    return false;
  }
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement) || !isReviewEditorActive(activeElement)) {
    return false;
  }
  activeElement.blur();
  dispatchReviewEditorEscapeBlur();
  return true;
}

export function useReviewEditorEscapeBlur(args: {
  enabled: boolean;
  rootRef: MutableRefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    const root = args.rootRef.current;
    if (!root || !args.enabled) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      blurReviewEditorIfEscape(event);
    };
    root.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      root.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [args.enabled, args.rootRef]);
}

export function handleMarkdownEditorKeyDownCapture(
  event: ReactKeyboardEvent<HTMLDivElement>,
  props: MarkdownEditorProps
) {
  if (props.reviewEscapeBlurEnabled === true && blurReviewEditorIfEscape(event)) {
    return;
  }
  handleEditorUndoRedoKeyDown(event, props);
}

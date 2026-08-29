import { type KeyboardEvent as ReactKeyboardEvent, useEffect, type MutableRefObject } from 'react';

import { onNativeEditingEscape, onWindowPriorityEscape } from '../../../shared/platform/keyboard';
import { dispatchReviewEditorEscapeBlur } from '../../../shared/platform/reviewEditorEscape';

import type { MarkdownEditorProps } from './markdownEditorTypes';

function isReviewEditorActive(activeElement: Element) {
  return Boolean(activeElement.closest('.markdown-editor-host[data-review-escape-blur="true"]'));
}

function isMarkdownEditorActive(activeElement: Element) {
  return Boolean(activeElement.closest('.markdown-editor-host,.cm-editor,.cm-content'));
}

function isOrdinaryPromptEditorActive(activeElement: Element) {
  const host = activeElement.closest<HTMLElement>('.markdown-editor-host.prompt-editor-host');
  return Boolean(
    host &&
    host.dataset.readOnly === 'false' &&
    host.dataset.reviewEscapeBlur === 'false'
  );
}

function isDialogOpen() {
  return Boolean(document.querySelector('[role="dialog"]'));
}

function blurActiveMarkdownEditor() {
  const activeElement = document.activeElement;
  if (activeElement instanceof HTMLElement && isMarkdownEditorActive(activeElement)) {
    activeElement.blur();
    return true;
  }
  const focusedCodeMirrorContent = document.querySelector<HTMLElement>('.markdown-editor-host .cm-editor.cm-focused .cm-content');
  if (!focusedCodeMirrorContent) {
    return false;
  }
  focusedCodeMirrorContent.blur();
  return true;
}

function blurActiveMarkdownEditorAfterEvent() {
  window.setTimeout(() => {
    blurActiveMarkdownEditor();
  }, 0);
}

function blurActiveMarkdownEditorIfEscape(
  event: KeyboardEvent | ReactKeyboardEvent<HTMLDivElement>,
  onExitEditing?: () => boolean
) {
  if (event.key !== 'Escape' || event.defaultPrevented) {
    return false;
  }
  const activeElement = document.activeElement;
  const shouldReturn = Boolean(
    onExitEditing && activeElement instanceof Element && isOrdinaryPromptEditorActive(activeElement)
  );
  const didBlur = blurActiveMarkdownEditor();
  if (didBlur) {
    if (shouldReturn) onExitEditing?.();
    blurActiveMarkdownEditorAfterEvent();
  }
  return didBlur;
}

function blurReviewEditorIfEscape(event: KeyboardEvent | ReactKeyboardEvent<HTMLDivElement>) {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof Element) || !isReviewEditorActive(activeElement)) {
    return false;
  }
  if (!blurActiveMarkdownEditorIfEscape(event)) {
    return false;
  }
  dispatchReviewEditorEscapeBlur();
  return true;
}

function blurActiveEditorForNativeEscape(enabled: boolean, onExitEditing?: () => boolean) {
  const activeElement = document.activeElement;
  const isReviewActive = activeElement instanceof Element && isReviewEditorActive(activeElement);
  const shouldReturn = Boolean(
    !enabled && onExitEditing && activeElement instanceof Element && isOrdinaryPromptEditorActive(activeElement)
  );
  if (!blurActiveMarkdownEditor()) {
    return;
  }
  if (enabled && isReviewActive) {
    dispatchReviewEditorEscapeBlur();
  }
  if (shouldReturn) onExitEditing?.();
}

export function useReviewEditorEscapeBlur(args: {
  enabled: boolean;
  onExitEditing?: () => boolean;
  rootRef: MutableRefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    const root = args.rootRef.current;
    if (!root) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (args.enabled) {
        blurReviewEditorIfEscape(event);
      } else {
        blurActiveMarkdownEditorIfEscape(event, args.onExitEditing);
      }
    };
    const handlePriorityEscape = (event: KeyboardEvent) => {
      if (isDialogOpen()) {
        return false;
      }
      if (args.enabled) {
        return blurReviewEditorIfEscape(event);
      }
      return blurActiveMarkdownEditorIfEscape(event, args.onExitEditing);
    };
    root.addEventListener('keydown', handleKeyDown, true);
    const unlistenPriorityEscape = onWindowPriorityEscape(handlePriorityEscape);
    const unlistenNativeEscape = onNativeEditingEscape({
      exitEditing: () => blurActiveEditorForNativeEscape(args.enabled, args.onExitEditing),
      isDialogOpen,
      isEditing: () => {
        const activeElement = document.activeElement;
        return activeElement instanceof Element && isMarkdownEditorActive(activeElement);
      }
    });
    return () => {
      root.removeEventListener('keydown', handleKeyDown, true);
      unlistenPriorityEscape();
      unlistenNativeEscape();
    };
  }, [args.enabled, args.onExitEditing, args.rootRef]);
}

export function handleMarkdownEditorKeyDownCapture(
  event: ReactKeyboardEvent<HTMLDivElement>,
  props: MarkdownEditorProps
) {
  if (props.reviewEscapeBlurEnabled === true && blurReviewEditorIfEscape(event)) {
    return;
  }
  blurActiveMarkdownEditorIfEscape(event, props.onExitEditing);
}

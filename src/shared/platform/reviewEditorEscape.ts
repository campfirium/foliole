const REVIEW_EDITOR_ESCAPE_BLUR_EVENT = 'foliole:review-editor-escape-blur';

export function dispatchReviewEditorEscapeBlur() {
  window.dispatchEvent(new CustomEvent(REVIEW_EDITOR_ESCAPE_BLUR_EVENT));
}

export function onReviewEditorEscapeBlur(listener: () => void) {
  window.addEventListener(REVIEW_EDITOR_ESCAPE_BLUR_EVENT, listener);
  return () => window.removeEventListener(REVIEW_EDITOR_ESCAPE_BLUR_EVENT, listener);
}

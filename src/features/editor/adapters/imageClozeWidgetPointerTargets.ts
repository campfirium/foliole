export function isImageClozeControlTarget(target: EventTarget | null) {
  return target instanceof Element &&
    target.closest('.cm-md-image-cloze-actions, .cm-md-image-cloze-delete, .cm-md-image-preview-trigger') !== null;
}

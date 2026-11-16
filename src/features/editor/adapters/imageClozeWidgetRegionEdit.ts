import { isDesktopRuntime } from '../../../shared/platform/runtime';
import { IMAGE_CLOZE_EDIT_EVENT, type ImageClozeEditEventDetail } from '../../image-cloze/model/imageClozeEvents';
import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';
import type { ImageFocusRect } from '../model/markdownImageFocus';

import { updateDraftRectElement } from './imageClozeWidgetDraft';
import { dispatchImageClozeDelete, findImageRegionNearBorder, isNearImageRegionBorder, toRelativeImagePoint } from './imageClozeWidgetInteractionHelpers';
import { isImageClozeControlTarget } from './imageClozeWidgetPointerTargets';
import { originalImagePoint } from './liveMarkdownImageCropFrame';
import { editMarkdownImageFocus } from './liveMarkdownImageFocus';
import { showImageRegionEditor } from './liveMarkdownImageRegionEditor';

export function findEditableImageFocus(overlay: HTMLElement, focus: ImageFocusRect | undefined, point: ReturnType<typeof toRelativeImagePoint>) {
  if (!focus || !isNearImageRegionBorder(focus, point)) return null;
  return overlay.closest<HTMLElement>('[data-md-image-focus-editable="true"]');
}

function openImageRegionEditor(args: {
  overlay: HTMLElement;
  region: ImageClozeEditorPresentation['regions'][number] | null;
  focus?: ImageFocusRect;
  point: ReturnType<typeof toRelativeImagePoint>;
}) {
  const { region, overlay } = args;
  if (!region) {
    const widget = findEditableImageFocus(overlay, args.focus, args.point);
    return Boolean(widget && args.focus && editMarkdownImageFocus(widget, args.focus));
  }
  if (region.openNodeId || !isDesktopRuntime()) return false;
  const widget = overlay.closest<HTMLElement>('.cm-md-image-widget');
  const surface = overlay.parentElement;
  const regionElement = [...(surface?.querySelectorAll<HTMLElement>('.cm-md-image-cloze-region') ?? [])]
    .find(element => element.dataset.regionId === region.id);
  if (!widget || !surface || !regionElement) return false;

  return showImageRegionEditor({
    surface,
    onPreview: rect => updateDraftRectElement(regionElement, rect),
    rect: region,
    kind: 'cloze',
    canRemove: true,
    trigger: null,
    async onCommit(rect) {
      if (!rect) {
        dispatchImageClozeDelete({ attachmentId: region.attachmentId, regionId: region.id });
        return true;
      }
      const before = { ...region, answer: '' };
      let saved: Promise<boolean> | undefined;
      widget.dispatchEvent(new CustomEvent<ImageClozeEditEventDetail>(IMAGE_CLOZE_EDIT_EVENT, {
        bubbles: true,
        detail: { edit: { before, after: { ...before, ...rect } }, respond: response => { saved = response; } }
      }));
      return saved ?? false;
    }
  });
}

export function attachImageRegionClick(args: {
  wrapper: HTMLElement;
  overlay: HTMLElement;
  attachmentId: string;
  presentation?: ImageClozeEditorPresentation | null;
  focus?: ImageFocusRect;
}) {
  let start: PointerEvent | null = null;
  args.wrapper.addEventListener('pointerdown', event => {
    start = event.button === 0 && !isImageClozeControlTarget(event.target) ? event : null;
  }, { capture: true });
  args.wrapper.addEventListener('pointercancel', () => { start = null; }, { capture: true });
  args.wrapper.addEventListener('click', event => {
    const down = start;
    start = null;
    if (!down || Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) > 4) return;
    const point = originalImagePoint(args.overlay, toRelativeImagePoint(args.overlay, down));
    const region = findImageRegionNearBorder(args.presentation, args.attachmentId, point);
    if (openImageRegionEditor({ overlay: args.overlay, region, point, ...(args.focus ? { focus: args.focus } : {}) })) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, { capture: true });
}

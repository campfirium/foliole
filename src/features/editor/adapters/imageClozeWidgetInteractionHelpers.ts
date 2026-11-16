import { IMAGE_CLOZE_CREATE_EVENT, IMAGE_CLOZE_DELETE_EVENT, type ImageClozeCreateEventDetail, type ImageClozeDeleteEventDetail } from '../../image-cloze/model/imageClozeEvents';
import type { ImageClozeEditorPresentation } from '../../image-cloze/model/imageClozePresentation';

import type { DraftRect } from './imageClozeWidgetDraft';

export function dispatchImageClozeCreate(detail: ImageClozeCreateEventDetail) {
  window.dispatchEvent(new CustomEvent<ImageClozeCreateEventDetail>(IMAGE_CLOZE_CREATE_EVENT, { detail }));
}

export function dispatchImageClozeDelete(detail: ImageClozeDeleteEventDetail) {
  window.dispatchEvent(new CustomEvent<ImageClozeDeleteEventDetail>(IMAGE_CLOZE_DELETE_EVENT, { detail }));
}

export function createImageClozeActionButton(args: { ariaLabel: string; iconPath: string; onClick: (event: MouseEvent) => void }) {
  const button = document.createElement('button');
  button.className = 'cm-md-image-cloze-action';
  button.setAttribute('aria-label', args.ariaLabel);
  button.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true" class="cm-md-image-icon"><path d="${args.iconPath}"></path></svg>`;
  button.type = 'button';
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  button.addEventListener('pointerup', (event) => {
    event.stopPropagation();
  });
  button.addEventListener('click', args.onClick);
  return button;
}

export function toRelativeImagePoint(overlay: HTMLElement, event: PointerEvent) {
  const rect = overlay.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    height: rect.height,
    width: rect.width,
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  };
}

export function findImageRegionNearBorder(
  presentation: ImageClozeEditorPresentation | null | undefined,
  attachmentId: string,
  point: ReturnType<typeof toRelativeImagePoint>
) {
  const regions = presentation?.regions.filter((region) => region.attachmentId === attachmentId) ?? [];
  return [...regions].reverse().find(region => isNearImageRegionBorder(region, point)) ?? null;
}

export function isNearImageRegionBorder(rect: DraftRect, point: ReturnType<typeof toRelativeImagePoint>) {
  if (!point) return false;
  const toleranceX = 10 / point.width;
  const toleranceY = 10 / point.height;
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const withinX = point.x >= rect.x - toleranceX && point.x <= right + toleranceX;
  const withinY = point.y >= rect.y - toleranceY && point.y <= bottom + toleranceY;
  return withinX && withinY && (
    Math.abs(point.x - rect.x) <= toleranceX || Math.abs(point.x - right) <= toleranceX ||
    Math.abs(point.y - rect.y) <= toleranceY || Math.abs(point.y - bottom) <= toleranceY
  );
}

export function buildImageClozeRegionDetail(args: { attachmentId: string; from: number; draftRect: DraftRect; to: number }) {
  return {
    answer: '',
    attachmentId: args.attachmentId,
    height: args.draftRect.height,
    id: `region-${crypto.randomUUID()}`,
    width: args.draftRect.width,
    x: args.draftRect.x,
    y: args.draftRect.y
  };
}

export function showImageClozeFeedback(host: HTMLElement, text: string, x: number, y: number) {
  host.querySelector('.cm-md-image-cloze-feedback')?.remove();
  const feedback = document.createElement('div');
  feedback.className = 'cm-md-image-cloze-feedback';
  feedback.textContent = text;
  feedback.style.left = `${x}px`;
  feedback.style.top = `${y}px`;
  host.append(feedback);
  window.setTimeout(() => feedback.remove(), 1400);
}

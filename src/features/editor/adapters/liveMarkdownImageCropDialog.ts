import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import { appFloatingSurfaceClassName } from '../../../shared/ui/FloatingSurface';
import type { ImageFocusRect } from '../model/markdownImageFocus';

import { updateDraftRectElement } from './imageClozeWidgetDraft';

const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
type Corner = typeof CORNERS[number];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resizeCrop(rect: ImageFocusRect, corner: Corner, dx: number, dy: number) {
  const minWidth = Math.min(rect.width, 0.01);
  const minHeight = Math.min(rect.height, 0.01);
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const x = corner.endsWith('w') ? clamp(rect.x + dx, 0, right - minWidth) : rect.x;
  const y = corner.startsWith('n') ? clamp(rect.y + dy, 0, bottom - minHeight) : rect.y;
  return {
    x,
    y,
    width: (corner.endsWith('e') ? clamp(right + dx, x + minWidth, 1) : right) - x,
    height: (corner.startsWith('s') ? clamp(bottom + dy, y + minHeight, 1) : bottom) - y
  };
}

function createCornerHandle(args: {
  area: HTMLElement;
  corner: Corner;
  getRect: () => ImageFocusRect;
  update: (rect: ImageFocusRect) => void;
}) {
  const { area, corner, getRect, update } = args;
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'cm-md-image-crop-handle';
  handle.dataset.corner = corner;
  handle.setAttribute('aria-label', translate(getStoredAppLocale(), `desktop.editor.image.cropHandle.${corner}`));
  let start: { x: number; y: number; rect: ImageFocusRect } | null = null;
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    handle.setPointerCapture(event.pointerId);
    start = { x: event.clientX, y: event.clientY, rect: getRect() };
  });
  handle.addEventListener('pointermove', event => {
    if (!start || !handle.hasPointerCapture(event.pointerId)) return;
    const { width, height } = area.getBoundingClientRect();
    if (width && height) update(resizeCrop(start.rect, corner, (event.clientX - start.x) / width, (event.clientY - start.y) / height));
  });
  handle.addEventListener('keydown', event => {
    const dx = Number(event.key === 'ArrowRight') - Number(event.key === 'ArrowLeft');
    const dy = Number(event.key === 'ArrowDown') - Number(event.key === 'ArrowUp');
    if (!dx && !dy) return;
    event.preventDefault();
    const step = event.shiftKey ? 0.05 : 0.01;
    update(resizeCrop(getRect(), corner, dx * step, dy * step));
  });
  return handle;
}

function createCropDialogButton(label: string, action: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'cm-md-image-crop-dialog-action';
  button.textContent = label;
  button.addEventListener('click', action);
  return button;
}

export function showImageCropDialog(args: {
  widget: HTMLElement;
  source: string;
  alt: string;
  rect: ImageFocusRect;
  canRemove: boolean;
  trigger: HTMLButtonElement | null;
  onCommit: (rect: ImageFocusRect | null) => void;
}) {
  const locale = getStoredAppLocale();
  const dialog = document.createElement('dialog');
  const title = translate(locale, 'desktop.editor.image.editCrop');
  dialog.className = appFloatingSurfaceClassName('panel', 'cm-md-image-crop-dialog text-foreground');
  dialog.setAttribute('aria-label', title);
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  const area = document.createElement('div');
  area.className = 'cm-md-image-crop-area';
  const image = document.createElement('img');
  image.src = args.source;
  image.alt = args.alt;
  image.draggable = false;
  const frame = document.createElement('div');
  frame.className = 'cm-md-image-crop-frame';
  let rect = args.rect;
  const update = (next: ImageFocusRect) => {
    rect = next;
    updateDraftRectElement(frame, rect);
  };
  update(rect);
  frame.append(...CORNERS.map(corner => createCornerHandle({ area, corner, getRect: () => rect, update })));
  area.append(image, frame);
  dialog.append(area, createCropDialogActions(dialog, args.canRemove, () => rect, args.onCommit));
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (!dialog.returnValue) args.trigger?.focus();
  });
  dialog.addEventListener('click', event => event.stopPropagation());
  dialog.addEventListener('keydown', event => event.stopPropagation());
  args.widget.append(dialog);
  dialog.showModal();
}

function createCropDialogActions(
  dialog: HTMLDialogElement,
  canRemove: boolean,
  getRect: () => ImageFocusRect,
  onCommit: (rect: ImageFocusRect | null) => void
) {
  const locale = getStoredAppLocale();
  const actions = document.createElement('div');
  actions.className = 'cm-md-image-crop-dialog-actions';
  const commit = (rect: ImageFocusRect | null) => {
    dialog.close('commit');
    onCommit(rect);
  };
  if (canRemove) actions.append(createCropDialogButton(translate(locale, 'desktop.editor.image.removeCrop'), () => commit(null)));
  actions.append(
    createCropDialogButton(translate(locale, 'desktop.editor.image.cancelCrop'), () => dialog.close()),
    createCropDialogButton(translate(locale, 'desktop.editor.image.applyCrop'), () => commit(getRect()))
  );
  return actions;
}

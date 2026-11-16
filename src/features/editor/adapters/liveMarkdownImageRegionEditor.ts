import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import type { ImageFocusRect } from '../model/markdownImageFocus';

import { updateDraftRectElement } from './imageClozeWidgetDraft';
import { createImageClozeActionButton } from './imageClozeWidgetInteractionHelpers';

const CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
const EDGES = ['n', 'e', 's', 'w'] as const;
type Corner = typeof CORNERS[number];
type Handle = Corner | typeof EDGES[number];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function resizeCrop(rect: ImageFocusRect, corner: Handle, dx: number, dy: number) {
  const minWidth = Math.min(rect.width, 0.01);
  const minHeight = Math.min(rect.height, 0.01);
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  const x = corner.endsWith('w') ? clamp(rect.x + dx, 0, right - minWidth) : rect.x;
  const y = corner.startsWith('n') ? clamp(rect.y + dy, 0, bottom - minHeight) : rect.y;
  return {
    x,
    y,
    width: corner.endsWith('e') ? clamp(right + dx, x + minWidth, 1) - x : x === rect.x ? rect.width : right - x,
    height: corner.startsWith('s') ? clamp(bottom + dy, y + minHeight, 1) - y : y === rect.y ? rect.height : bottom - y
  };
}

function createCornerHandle(args: {
  area: HTMLElement;
  corner: Handle;
  getRect: () => ImageFocusRect;
  isRegion: boolean;
  update: (rect: ImageFocusRect) => void;
}) {
  const { area, corner, getRect, update } = args;
  const handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'cm-md-image-crop-handle';
  handle.dataset.corner = corner;
  handle.setAttribute('aria-label', translate(getStoredAppLocale(), args.isRegion ? `desktop.editor.image.regionHandle.${corner}` : `desktop.editor.image.cropHandle.${corner as Corner}`));
  let start: { x: number; y: number; rect: ImageFocusRect } | null = null;
  handle.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
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
    event.stopPropagation();
    const step = event.shiftKey ? 0.05 : 0.01;
    update(resizeCrop(getRect(), corner, dx * step, dy * step));
  });
  return handle;
}

type RegionKind = 'crop' | 'focus' | 'cloze';

const titles = {
  crop: 'desktop.editor.image.editCrop',
  focus: 'desktop.editor.image.editFocus',
  cloze: 'desktop.editor.image.editCloze'
} as const;

interface RegionEditorOptions {
  surface: HTMLElement;
  rect: ImageFocusRect;
  kind: RegionKind;
  canRemove: boolean;
  trigger?: HTMLButtonElement | null;
  onPreview?: (rect: ImageFocusRect) => void;
  onCommit: (rect: ImageFocusRect | null) => void | Promise<boolean>;
  requestMeasure?: () => void;
}

export function showImageRegionEditor(args: RegionEditorOptions) {
  const { surface, kind } = args;
  if (surface.dataset.mdImageRegionEdit) return false;
  const plane = surface.querySelector<HTMLElement>('.cm-md-image-crop-plane') ?? surface;
  const image = plane.querySelector<HTMLImageElement>('.cm-md-image-element');
  if (!image?.naturalWidth || !image.naturalHeight) return false;
  surface.dataset.mdImageRegionEdit = kind;
  surface.style.setProperty('--image-edit-original-ratio', `${image.naturalWidth} / ${image.naturalHeight}`);
  const frame = document.createElement('span');
  frame.className = 'cm-md-image-crop-frame';
  let rect = args.rect;
  const update = (next: ImageFocusRect) => {
    rect = next;
    updateDraftRectElement(frame, rect);
    args.onPreview?.(rect);
  };
  const close = () => {
    frame.remove();
    controls.remove();
    delete surface.dataset.mdImageRegionEdit;
    surface.style.removeProperty('--image-edit-original-ratio');
    args.onPreview?.(args.rect);
    args.requestMeasure?.();
  };
  const controls = createRegionActions(args, () => rect, close);
  update(rect);
  const handles = kind === 'crop' ? CORNERS : [...CORNERS, ...EDGES];
  frame.append(...handles.map(corner => createCornerHandle({ area: plane, corner, getRect: () => rect, update, isRegion: kind !== 'crop' })));
  plane.append(frame);
  surface.append(controls);
  args.requestMeasure?.();
  return true;
}

function createRegionActions(args: RegionEditorOptions, getRect: () => ImageFocusRect, close: () => void) {
  const locale = getStoredAppLocale();
  const controls = document.createElement('span');
  controls.className = 'cm-md-image-region-controls';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', translate(locale, titles[args.kind]));
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  const cancel = () => {
    close();
    args.trigger?.focus();
  };
  const commit = async (rect: ImageFocusRect | null) => {
    const buttons = [...controls.querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    status.textContent = '';
    try {
      if (await args.onCommit(rect) === false) throw new Error('image_region_not_saved');
      close();
    } catch {
      status.textContent = translate(locale, 'desktop.editor.image.regionSaveFailed');
      buttons.forEach(button => { button.disabled = false; });
    }
  };
  const add = (label: string, iconPath: string, action: () => void) => {
    const button = createImageClozeActionButton({ ariaLabel: label, iconPath, onClick(event) {
      event.preventDefault();
      event.stopPropagation();
      action();
    } });
    button.title = label;
    controls.append(button);
    return button;
  };
  if (args.canRemove) add(
    translate(locale, args.kind === 'cloze' ? 'desktop.editor.image.removeImageCloze' : 'desktop.editor.image.removeCrop'),
    'M3 4h10M6 4V2.5h4V4M4.5 4l.6 9h5.8l.6-9M7 6.5v4M9 6.5v4',
    () => { void commit(null); }
  );
  const cancelButton = add(translate(locale, 'desktop.editor.image.cancelCrop'), 'M4 4l8 8m0-8-8 8', cancel);
  add(translate(locale, args.kind === 'crop' ? 'desktop.editor.image.applyCrop' : 'desktop.editor.image.applyRegion'),
    'M3 8l3.3 3.3L13 4.6', () => { void commit(getRect()); });
  controls.prepend(status);
  controls.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !cancelButton.disabled) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  });
  return controls;
}

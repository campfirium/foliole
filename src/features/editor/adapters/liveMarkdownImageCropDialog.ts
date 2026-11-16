import { getStoredAppLocale } from '../../../shared/localization/appLanguage';
import { translate } from '../../../shared/localization/translations';
import { appFloatingSurfaceClassName } from '../../../shared/ui/FloatingSurface';
import type { ImageFocusRect } from '../model/markdownImageFocus';

import { updateDraftRectElement } from './imageClozeWidgetDraft';

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
  kind?: 'crop' | 'focus' | 'cloze';
  trigger: HTMLButtonElement | null;
  onCommit: (rect: ImageFocusRect | null) => void | Promise<boolean>;
}) {
  const locale = getStoredAppLocale();
  const dialog = document.createElement('dialog');
  const kind = args.kind ?? 'crop';
  const title = translate(locale, ({ crop: 'desktop.editor.image.editCrop', focus: 'desktop.editor.image.editFocus', cloze: 'desktop.editor.image.editCloze' } as const)[kind]);
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
  const handles = kind === 'crop' ? CORNERS : [...CORNERS, ...EDGES];
  frame.append(...handles.map(corner => createCornerHandle({ area, corner, getRect: () => rect, update, isRegion: kind !== 'crop' })));
  area.append(image, frame);
  dialog.append(area, createCropDialogActions(dialog, args.canRemove, () => rect, args.onCommit, kind));
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
  onCommit: (rect: ImageFocusRect | null) => void | Promise<boolean>,
  kind: 'crop' | 'focus' | 'cloze'
) {
  const locale = getStoredAppLocale();
  const actions = document.createElement('div');
  actions.className = 'cm-md-image-crop-dialog-actions';
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  const commit = async (rect: ImageFocusRect | null) => {
    if (kind !== 'cloze') {
      dialog.close('commit');
      await onCommit(rect);
      return;
    }
    const buttons = [...dialog.querySelectorAll('button')];
    buttons.forEach(button => { button.disabled = true; });
    status.textContent = '';
    const keepOpen = (event: Event) => event.preventDefault();
    dialog.addEventListener('cancel', keepOpen);
    try {
      if (await onCommit(rect) === false) throw new Error('image_region_not_saved');
      dialog.close('commit');
    } catch {
      status.textContent = translate(locale, 'desktop.editor.image.regionSaveFailed');
      buttons.forEach(button => { button.disabled = false; });
    } finally {
      dialog.removeEventListener('cancel', keepOpen);
    }
  };
  if (canRemove) actions.append(createCropDialogButton(
    translate(locale, kind === 'cloze' ? 'desktop.editor.image.removeImageCloze' : 'desktop.editor.image.removeCrop'), () => { void commit(null); }
  ));
  actions.append(
    status,
    createCropDialogButton(translate(locale, 'desktop.editor.image.cancelCrop'), () => dialog.close()),
    createCropDialogButton(translate(locale, kind !== 'crop' ? 'desktop.editor.image.applyRegion' : 'desktop.editor.image.applyCrop'), () => { void commit(getRect()); })
  );
  return actions;
}

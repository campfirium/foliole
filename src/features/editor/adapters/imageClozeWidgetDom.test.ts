import { describe, expect, it, vi } from 'vitest';

import type { ImageClozeDraftRegion } from '../../image-cloze/model/imageCloze';
import { IMAGE_CLOZE_CREATE_EVENT, IMAGE_CLOZE_DELETE_EVENT } from '../../image-cloze/model/imageClozeEvents';

import { createImageClozeImageSurface } from './imageClozeWidgetDom';

function createPointerLikeEvent(
  type: string,
  init: Partial<{ bubbles: boolean; button: number; clientX: number; clientY: number; pointerId: number }>
) {
  return Object.assign(new Event(type, { bubbles: init.bubbles ?? true }), init);
}

function clickDeleteButton(deleteButton: HTMLButtonElement) {
  deleteButton.dispatchEvent(createPointerLikeEvent('pointerdown', { button: 0, clientX: 137, clientY: 112, pointerId: 7 }));
  deleteButton.dispatchEvent(createPointerLikeEvent('pointerup', { button: 0, clientX: 137, clientY: 112, pointerId: 7 }));
  deleteButton.click();
}

function createSurface() {
  const surface = createImageClozeImageSurface({
    attachmentId: 'hash-1',
    display: 'block',
    from: 10,
    presentation: {
      canCreate: true,
      focusRegionId: null,
      hiddenRegionIds: [],
      outlinedRegionIds: ['region-1'],
      regions: [{ attachmentId: 'hash-1', height: 0.2, id: 'region-1', width: 0.3, x: 0.1, y: 0.2 }]
    },
    renderImage: () => {
      const image = document.createElement('img');
        image.src = 'https://example.com/demo.png';
        return image;
    },
    previewAlt: 'Demo image',
    previewPresentation: null,
    previewSource: 'https://example.com/demo.png',
    to: 30
  });
  return surface;
}

function mockOverlayRect(overlay: HTMLElement) {
  Object.defineProperty(overlay, 'getBoundingClientRect', {
    value: () =>
      ({
        bottom: 300,
        height: 240,
        left: 0,
        right: 400,
        toJSON: () => ({}),
        top: 0,
        width: 400,
        x: 0,
        y: 0
      }) satisfies DOMRect
  });
}

function mockOverlayPointerCapture(overlay: HTMLElement) {
  Object.defineProperty(overlay, 'setPointerCapture', { value: () => undefined });
  Object.defineProperty(overlay, 'releasePointerCapture', { value: () => undefined });
  Object.defineProperty(overlay, 'hasPointerCapture', { value: () => true });
}

function startCreateDraft(surface: HTMLElement) {
  const overlay = surface.querySelector('.cm-md-image-cloze-overlay') as HTMLElement;
  mockOverlayRect(overlay);
  mockOverlayPointerCapture(overlay);
  surface.dispatchEvent(new Event('pointerenter', { bubbles: true }));
  overlay.dispatchEvent(createPointerLikeEvent('pointerdown', { button: 0, clientX: 240, clientY: 140, pointerId: 1 }));
  overlay.dispatchEvent(createPointerLikeEvent('pointermove', { clientX: 320, clientY: 200, pointerId: 1 }));
  overlay.dispatchEvent(createPointerLikeEvent('pointerup', { clientX: 320, clientY: 200, pointerId: 1 }));
}

describe('image cloze widget creation', () => {
  it('keeps direct draft creation available on hover without top-right controls', () => {
    const surface = createSurface();
    const overlay = surface.querySelector('.cm-md-image-cloze-overlay') as HTMLElement;
    const deleteControl = surface.querySelector('.cm-md-image-cloze-delete') as HTMLElement;

    expect(overlay.hidden).toBe(true);
    expect(deleteControl.hidden).toBe(true);

    surface.dispatchEvent(new Event('pointerenter', { bubbles: true }));

    expect(overlay.hidden).toBe(false);
    expect(deleteControl.hidden).toBe(true);
  });

  it('keeps the drafted rectangle visible after direct drag creation starts', () => {
    const surface = createSurface();
    const draft = surface.querySelector('.cm-md-image-cloze-draft') as HTMLElement;
    const actions = surface.querySelector('.cm-md-image-cloze-actions') as HTMLElement;

    startCreateDraft(surface);

    expect(draft.hidden).toBe(false);
    expect(actions.hidden).toBe(false);
    expect(actions.style.left).toBe('320px');
    expect(actions.style.top).toBe('200px');
  });

  it('dispatches create after confirming a drafted region', () => {
    const surface = createSurface();
    const actions = surface.querySelector('.cm-md-image-cloze-actions') as HTMLElement;
    const confirmButton = actions.querySelector('button[aria-label="Confirm image cloze"]') as HTMLButtonElement;
    const onCreate = vi.fn();

    window.addEventListener(IMAGE_CLOZE_CREATE_EVENT, onCreate);
    startCreateDraft(surface);
    confirmButton.click();

    expect(onCreate).toHaveBeenCalledTimes(1);
    const detail = onCreate.mock.calls[0]?.[0]?.detail;
    expect(detail?.attachmentId).toBe('hash-1');
    expect(detail?.regions).toHaveLength(1);
    expect(detail?.regions[0]?.id).toEqual(expect.any(String));
    expect(detail?.regions[0]?.width).toBeCloseTo(0.2);
    expect(detail?.regions[0]?.height).toBeCloseTo(0.25);
    window.removeEventListener(IMAGE_CLOZE_CREATE_EVENT, onCreate);
  });
});

describe('image cloze widget queued creation', () => {
  it('keeps queued regions and submits them together after using the add button', () => {
    const surface = createSurface();
    const actions = surface.querySelector('.cm-md-image-cloze-actions') as HTMLElement;
    const addButton = actions.querySelector('button[aria-label="Add image cloze region"]') as HTMLButtonElement;
    const confirmButton = actions.querySelector('button[aria-label="Confirm image cloze"]') as HTMLButtonElement;
    const overlay = surface.querySelector('.cm-md-image-cloze-overlay') as HTMLElement;
    const onCreate = vi.fn();

    window.addEventListener(IMAGE_CLOZE_CREATE_EVENT, onCreate);
    startCreateDraft(surface);
    addButton.click();
    expect(surface.querySelectorAll('[data-region-pending="true"]')).toHaveLength(1);

    overlay.dispatchEvent(createPointerLikeEvent('pointerdown', { button: 0, clientX: 80, clientY: 48, pointerId: 2 }));
    overlay.dispatchEvent(createPointerLikeEvent('pointermove', { clientX: 140, clientY: 96, pointerId: 2 }));
    overlay.dispatchEvent(createPointerLikeEvent('pointerup', { clientX: 140, clientY: 96, pointerId: 2 }));
    confirmButton.click();

    expect(onCreate).toHaveBeenCalledTimes(1);
    const detail = onCreate.mock.calls[0]?.[0]?.detail;
    const regions = detail?.regions ?? [];
    expect(regions).toHaveLength(2);
    expect(regions.some((region: ImageClozeDraftRegion) => Math.abs(region.width - 0.2) < 0.001 && Math.abs(region.height - 0.25) < 0.001)).toBe(true);
    expect(new Set(regions.map((region: ImageClozeDraftRegion) => region.id)).size).toBe(2);
    expect(surface.querySelectorAll('[data-region-pending="true"]')).toHaveLength(0);
    window.removeEventListener(IMAGE_CLOZE_CREATE_EVENT, onCreate);
  });
});

describe('image cloze widget selection', () => {
  it('selects only near the region border and dispatches delete from the click position', () => {
    const surface = createSurface();
    const overlay = surface.querySelector('.cm-md-image-cloze-overlay') as HTMLElement;
    const region = surface.querySelector('.cm-md-image-cloze-region[data-region-id="region-1"]') as HTMLElement;
    const onDelete = vi.fn();

    mockOverlayRect(overlay);
    surface.dispatchEvent(new Event('pointerenter', { bubbles: true }));
    window.addEventListener(IMAGE_CLOZE_DELETE_EVENT, onDelete);

    overlay.dispatchEvent(createPointerLikeEvent('pointermove', { button: 0, clientX: 120, clientY: 95, pointerId: 3 }));
    overlay.dispatchEvent(createPointerLikeEvent('pointerdown', { button: 0, clientX: 120, clientY: 95, pointerId: 3 }));
    const deleteButton = surface.querySelector('.cm-md-image-cloze-delete button[aria-label="Delete image cloze"]') as HTMLButtonElement;
    const deleteControl = surface.querySelector('.cm-md-image-cloze-delete') as HTMLElement;

    expect(region.dataset.regionState).toBe('selected');
    expect(deleteControl.hidden).toBe(false);
    expect(deleteControl.style.left).toBe('120px');
    expect(deleteControl.style.top).toBe('95px');

    clickDeleteButton(deleteButton);

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(surface.querySelector('.cm-md-image-cloze-region[data-region-id="region-1"]')).toBeNull();
    window.removeEventListener(IMAGE_CLOZE_DELETE_EVENT, onDelete);
  });

  it('does not select when clicking the middle of the existing region', () => {
    const surface = createSurface();
    const overlay = surface.querySelector('.cm-md-image-cloze-overlay') as HTMLElement;
    const region = surface.querySelector('.cm-md-image-cloze-region[data-region-id="region-1"]') as HTMLElement;
    const deleteControl = surface.querySelector('.cm-md-image-cloze-delete') as HTMLElement;

    mockOverlayRect(overlay);
    mockOverlayPointerCapture(overlay);
    surface.dispatchEvent(new Event('pointerenter', { bubbles: true }));
    overlay.dispatchEvent(createPointerLikeEvent('pointermove', { button: 0, clientX: 100, clientY: 72, pointerId: 4 }));
    overlay.dispatchEvent(createPointerLikeEvent('pointerdown', { button: 0, clientX: 100, clientY: 72, pointerId: 4 }));

    expect(region.dataset.regionState).toBe('outlined');
    expect(deleteControl.hidden).toBe(true);
  });

  it('selects the existing region from a border click even when hover state was not updated first', () => {
    const surface = createSurface();
    const overlay = surface.querySelector('.cm-md-image-cloze-overlay') as HTMLElement;
    const region = surface.querySelector('.cm-md-image-cloze-region[data-region-id="region-1"]') as HTMLElement;
    const deleteControl = surface.querySelector('.cm-md-image-cloze-delete') as HTMLElement;

    mockOverlayRect(overlay);
    surface.dispatchEvent(new Event('pointerenter', { bubbles: true }));
    overlay.dispatchEvent(createPointerLikeEvent('pointerdown', { button: 0, clientX: 120, clientY: 95, pointerId: 5 }));

    expect(region.dataset.regionState).toBe('selected');
    expect(deleteControl.hidden).toBe(false);
  });
});

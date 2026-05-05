import { describe, expect, it, vi } from 'vitest';

import { IMAGE_CLOZE_CREATE_EVENT } from '../../image-cloze/model/imageClozeEvents';
import { createImageClozeImageSurface } from './imageClozeWidgetDom';

function createPointerLikeEvent(
  type: string,
  init: Partial<{ bubbles: boolean; button: number; clientX: number; clientY: number; pointerId: number }>
) {
  return Object.assign(new Event(type, { bubbles: init.bubbles ?? true }), init);
}

function createSurface() {
  const surface = createImageClozeImageSurface({
    attachmentId: 'hash-1',
    display: 'block',
    from: 10,
    renderImage: () => {
      const image = document.createElement('img');
      image.src = 'https://example.com/demo.png';
      return image;
    },
    to: 30
  });

  Object.defineProperty(surface, 'getBoundingClientRect', {
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

  return surface;
}

describe('image cloze widget toolbar', () => {
  it('opens direct drag mode on hover and hides it when leaving idle', () => {
    const surface = createSurface();
    const overlay = surface.querySelector('.cm-md-image-cloze-overlay') as HTMLElement;

    expect(surface.querySelector('.cm-md-image-toolbar')).toBeNull();
    expect(overlay.hidden).toBe(true);
    expect(surface.dataset.mdImageClozeActive).toBe('false');

    surface.dispatchEvent(new Event('pointerenter', { bubbles: true }));

    expect(overlay.hidden).toBe(false);
    expect(surface.dataset.mdImageClozeActive).toBe('true');

    surface.dispatchEvent(new Event('pointerleave', { bubbles: true }));

    expect(overlay.hidden).toBe(true);
    expect(surface.dataset.mdImageClozeActive).toBe('false');
  });

  it('keeps the drafted rectangle visible after pointerup and ignores repeated hover opens', () => {
    const surface = createSurface();
    const overlay = surface.querySelector('.cm-md-image-cloze-overlay') as HTMLElement;
    const draft = surface.querySelector('.cm-md-image-cloze-draft') as HTMLElement;
    const actions = surface.querySelector('.cm-md-image-cloze-actions') as HTMLElement;

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
    Object.defineProperty(overlay, 'setPointerCapture', { value: () => undefined });
    Object.defineProperty(overlay, 'releasePointerCapture', { value: () => undefined });
    Object.defineProperty(overlay, 'hasPointerCapture', { value: () => true });

    surface.dispatchEvent(new Event('pointerenter', { bubbles: true }));
    overlay.dispatchEvent(createPointerLikeEvent('pointerdown', { button: 0, clientX: 40, clientY: 50, pointerId: 1 }));
    overlay.dispatchEvent(createPointerLikeEvent('pointermove', { clientX: 160, clientY: 120, pointerId: 1 }));

    expect(draft.hidden).toBe(false);
    expect(actions.hidden).toBe(true);

    overlay.dispatchEvent(createPointerLikeEvent('pointerup', { clientX: 160, clientY: 120, pointerId: 1 }));

    expect(draft.hidden).toBe(false);
    expect(actions.hidden).toBe(false);
    expect(actions.style.left).toBe('160px');
    expect(actions.style.top).toBe('120px');

    surface.dispatchEvent(new Event('pointerenter', { bubbles: true }));

    expect(draft.hidden).toBe(false);
    expect(actions.hidden).toBe(false);
  });

  it('dispatches create on confirm click instead of starting a new draft', () => {
    const surface = createSurface();
    const overlay = surface.querySelector('.cm-md-image-cloze-overlay') as HTMLElement;
    const actions = surface.querySelector('.cm-md-image-cloze-actions') as HTMLElement;
    const confirmButton = actions.querySelector('button') as HTMLButtonElement;
    const onCreate = vi.fn();

    window.addEventListener(IMAGE_CLOZE_CREATE_EVENT, onCreate);
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
    Object.defineProperty(overlay, 'setPointerCapture', { value: () => undefined });
    Object.defineProperty(overlay, 'releasePointerCapture', { value: () => undefined });
    Object.defineProperty(overlay, 'hasPointerCapture', { value: () => true });

    surface.dispatchEvent(new Event('pointerenter', { bubbles: true }));
    overlay.dispatchEvent(createPointerLikeEvent('pointerdown', { button: 0, clientX: 40, clientY: 50, pointerId: 1 }));
    overlay.dispatchEvent(createPointerLikeEvent('pointermove', { clientX: 160, clientY: 120, pointerId: 1 }));
    overlay.dispatchEvent(createPointerLikeEvent('pointerup', { clientX: 160, clientY: 120, pointerId: 1 }));

    confirmButton.dispatchEvent(createPointerLikeEvent('pointerdown', { button: 0, clientX: 160, clientY: 120, pointerId: 2 }));
    confirmButton.click();

    expect(onCreate).toHaveBeenCalledTimes(1);
    window.removeEventListener(IMAGE_CLOZE_CREATE_EVENT, onCreate);
  });
});

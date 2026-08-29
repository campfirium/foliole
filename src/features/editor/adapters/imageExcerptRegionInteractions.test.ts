import { beforeEach, expect, it, vi } from 'vitest';

import {
  IMAGE_EXCERPT_REGION_SELECTED_EVENT,
  requestImageExcerptRegionSelection
} from '../model/imageExcerptRegionSelection';

import { attachImageExcerptRegionInteractions } from './imageExcerptRegionInteractions';

function pointer(type: string, x: number, y: number, pointerId = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as PointerEvent;
  Object.defineProperties(event, {
    button: { value: 0 }, clientX: { value: x }, clientY: { value: y },
    isPrimary: { value: true }, pointerId: { value: pointerId }
  });
  return event;
}

beforeEach(() => {
  document.body.replaceChildren();
});

it('consumes one legal region from the requested image occurrence', () => {
  const surface = document.createElement('span');
  const overlay = document.createElement('div');
  const draftRectElement = document.createElement('div');
  const image = document.createElement('img');
  overlay.append(draftRectElement);
  surface.append(image, overlay);
  document.body.append(surface);
  vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
    bottom: 100, height: 100, left: 0, right: 200, top: 0, width: 200, x: 0, y: 0, toJSON: () => ({})
  });
  Object.assign(surface, {
    hasPointerCapture: () => false,
    releasePointerCapture: vi.fn(),
    setPointerCapture: vi.fn()
  });
  const selected = vi.fn();
  window.addEventListener(IMAGE_EXCERPT_REGION_SELECTED_EVENT, selected, { once: true });
  const cleanup = attachImageExcerptRegionInteractions({
    attachmentId: 'asset-1', draftRectElement, editorNodeId: 'topic-1', from: 10,
    getImageRange: () => ({ from: 20, to: 50 }), image, overlay, surface, to: 40
  });

  expect(requestImageExcerptRegionSelection('topic-1')).toBe(true);
  overlay.dispatchEvent(pointer('pointerdown', 20, 10));
  overlay.dispatchEvent(pointer('pointerup', 120, 60));

  expect(selected).toHaveBeenCalledOnce();
  expect((selected.mock.calls[0]?.[0] as CustomEvent).detail).toMatchObject({
    attachmentId: 'asset-1', imageRange: { from: 20, to: 50 },
    rect: { height: 0.5, width: 0.5, x: 0.1, y: 0.1 }
  });
  cleanup();
});

it('keeps the one-shot mode active after a too-small drag and cancels with Escape', () => {
  const surface = document.createElement('span');
  const overlay = document.createElement('div');
  const draftRectElement = document.createElement('div');
  const image = document.createElement('img');
  overlay.append(draftRectElement);
  surface.append(image, overlay);
  document.body.append(surface);
  vi.spyOn(overlay, 'getBoundingClientRect').mockReturnValue({
    bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100, x: 0, y: 0, toJSON: () => ({})
  });
  Object.assign(surface, { hasPointerCapture: () => false, setPointerCapture: vi.fn() });
  const selected = vi.fn();
  window.addEventListener(IMAGE_EXCERPT_REGION_SELECTED_EVENT, selected);
  const cleanup = attachImageExcerptRegionInteractions({
    attachmentId: 'asset-1', draftRectElement, editorNodeId: 'topic-1', from: 0,
    getImageRange: () => ({ from: 0, to: 30 }), image, overlay, surface, to: 30
  });

  requestImageExcerptRegionSelection('topic-1');
  overlay.dispatchEvent(pointer('pointerdown', 10, 10));
  overlay.dispatchEvent(pointer('pointerup', 14, 14));
  expect(selected).not.toHaveBeenCalled();
  expect(surface.dataset.mdImageExcerptActive).toBe('true');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  expect(surface.dataset.mdImageExcerptActive).toBe('false');
  cleanup();
  window.removeEventListener(IMAGE_EXCERPT_REGION_SELECTED_EVENT, selected);
});

import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import type { ImageClozeDraftRegion } from '../features/image-cloze/model/imageCloze';
import { renderWithLocalization } from '../shared/localization/testLocalization';

import { CompanionImageClozeEditor } from './CompanionImageClozeEditor';
import { changeImageClozeRect, zoomImageClozeView } from './companionImageClozeGeometry';

const hash = 'a'.repeat(64);
const bounds = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} });

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('PointerEvent', class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-cloze-image') || this.tagName === 'IMG' ? bounds(-200, 100, 800, 400) : bounds(0, 0, 400, 600);
  });
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(200);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function open(confirm = vi.fn<(regions: ImageClozeDraftRegion[]) => Promise<void>>(async () => {}), cancel = vi.fn()) {
  renderWithLocalization(<CompanionImageClozeEditor attachmentId={hash} src="data:image/png;base64,png" onConfirm={confirm} onCancel={cancel} />);
  fireEvent.load(screen.getByAltText('Original image'));
  return { confirm, cancel };
}

it('positions the image, then moves and resizes a mask in original-image coordinates before confirming', async () => {
  const { confirm } = open();
  fireEvent.click(screen.getByRole('button', { name: 'Add mask' }));
  const mask = screen.getByLabelText('Mask 1');
  fireEvent.pointerDown(mask, { button: 0, clientX: 160, clientY: 260 });
  fireEvent.pointerMove(screen.getByTestId('image-cloze-canvas'), { clientX: 240, clientY: 300 });
  fireEvent.pointerUp(screen.getByTestId('image-cloze-canvas'));
  fireEvent.pointerDown(mask.querySelector('[data-cloze-handle="se"]')!, { button: 0, clientX: 300, clientY: 340 });
  fireEvent.pointerMove(screen.getByTestId('image-cloze-canvas'), { clientX: 380, clientY: 380 });
  fireEvent.pointerUp(screen.getByTestId('image-cloze-canvas'));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
  const region = confirm.mock.calls[0]![0] as unknown as { x: number; y: number; width: number; height: number }[];
  expect(region[0]!.x).toBeCloseTo(0.45);
  expect(region[0]!.y).toBeCloseTo(0.5);
  expect(region[0]!.width).toBeCloseTo(0.4);
  expect(region[0]!.height).toBeCloseTo(0.3);
});

it('keeps masks on write failure, blocks duplicate confirmation while saving, and retries the same region', async () => {
  let finish!: () => void;
  const confirm = vi.fn().mockRejectedValueOnce(new Error('disk')).mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  open(confirm);
  fireEvent.click(screen.getByRole('button', { name: 'Add mask' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Your masks are kept');
  expect(screen.getByLabelText('Mask 1')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(screen.getByRole('button', { name: 'Creating…' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  expect(confirm.mock.calls[1]).toEqual(confirm.mock.calls[0]);
  finish();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirm' })).toBeEnabled());
});

it('cancels without confirming and refuses creation when the original image cannot load', () => {
  const { cancel, confirm } = open();
  fireEvent.error(screen.getByAltText('Original image'));
  expect(screen.getByRole('button', { name: 'Add mask' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(cancel).toHaveBeenCalledOnce(); expect(confirm).not.toHaveBeenCalled();
});

it('keeps a zoom anchor fixed and clamps moved and resized masks to the original image', () => {
  expect(zoomImageClozeView({ scale: 1, x: 0, y: 0 }, 2, { x: 40, y: 20 })).toEqual({ scale: 2, x: -40, y: -20 });
  expect(changeImageClozeRect({ x: 0.2, y: 0.2, width: 0.3, height: 0.3 }, 'move', 9, -9)).toEqual({ x: 0.7, y: 0, width: 0.3, height: 0.3 });
  const resized = changeImageClozeRect({ x: 0.2, y: 0.2, width: 0.3, height: 0.3 }, 'nw', 9, 9);
  expect(resized.width).toBeCloseTo(0.03); expect(resized.height).toBeCloseTo(0.03);
});

it('pinches and pans in positioning mode before adding a mask', async () => {
  const { confirm } = open();
  const canvas = screen.getByTestId('image-cloze-canvas');
  fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 300 });
  fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, clientX: 200, clientY: 300 });
  fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 300, clientY: 300 });
  expect(canvas.querySelector('[data-cloze-image]')).toHaveStyle({ transform: 'translate(-50%, -50%) translate(100px, 0px) scale(2)' });
  fireEvent.pointerUp(canvas, { pointerId: 2 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 120, clientY: 340 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
  expect(canvas.querySelector('[data-cloze-image]')).toHaveStyle({ transform: 'translate(-50%, -50%) translate(120px, 0px) scale(2)' });
  fireEvent.click(screen.getByRole('button', { name: 'Add mask' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(confirm).toHaveBeenCalledOnce());
});

it('uses pinch gestures while adjusting a mask and keeps the image within reach after a large pan', () => {
  open();
  fireEvent.click(screen.getByRole('button', { name: 'Add mask' }));
  const canvas = screen.getByTestId('image-cloze-canvas');
  const plane = canvas.querySelector<HTMLElement>('[data-cloze-image]')!;
  fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, clientX: 100, clientY: 300 });
  fireEvent.pointerDown(canvas, { pointerId: 2, button: 0, clientX: 200, clientY: 300 });
  fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 300, clientY: 300 });
  expect(plane.style.transform).toContain('scale(2)');
  fireEvent.pointerUp(canvas, { pointerId: 2 });
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 10000, clientY: 10000 });
  const match = plane.style.transform.match(/translate\(([-.\d]+)px, ([-.\d]+)px\)/)!;
  expect(Math.abs(Number(match[1]))).toBeLessThanOrEqual(600);
  expect(Math.abs(Number(match[2]))).toBeLessThanOrEqual(100);
  expect(screen.getByLabelText('Mask 1')).toBeVisible();
});

it('fits an already loaded cached image without waiting for another load event', () => {
  vi.spyOn(HTMLImageElement.prototype, 'complete', 'get').mockReturnValue(true);
  renderWithLocalization(<CompanionImageClozeEditor attachmentId={hash} src="cached.png" onConfirm={async () => {}} onCancel={() => {}} />);
  expect(screen.getByRole('button', { name: 'Add mask' })).toBeEnabled();
  expect(screen.getByAltText('Original image').parentElement).toHaveStyle({ width: '400px', height: '200px' });
});

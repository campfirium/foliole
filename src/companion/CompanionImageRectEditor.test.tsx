import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { renderWithLocalization } from '../shared/localization/testLocalization';

import { drawImageClozeMask, installImageClozePointerEvents } from './companionImageCloze.testSupport';
import { CompanionImageClozeEditor } from './CompanionImageClozeEditor';
import type { CompanionImageRects } from './useCompanionImageRectSession';

const hash = 'a'.repeat(64);
const bounds = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} });

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.stubGlobal('PointerEvent', installImageClozePointerEvents());
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-cloze-image') || this.tagName === 'IMG' ? bounds(-200, 100, 800, 400) : bounds(0, 0, 400, 600);
  });
  vi.spyOn(HTMLImageElement.prototype, 'naturalWidth', 'get').mockReturnValue(400);
  vi.spyOn(HTMLImageElement.prototype, 'naturalHeight', 'get').mockReturnValue(200);
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = vi.fn(() => false);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function open(rects: CompanionImageRects = { focus: null, crop: null }, onSaveRect = vi.fn(async () => {})) {
  const onConfirm = vi.fn(async () => {});
  const onCancel = vi.fn();
  renderWithLocalization(<CompanionImageClozeEditor attachmentId={hash} src="data:image/png;base64,png" onConfirm={onConfirm} onCancel={onCancel}
    rects={rects} onSaveRect={onSaveRect} />);
  fireEvent.load(screen.getByAltText('Original image'));
  return { onSaveRect, onConfirm, onCancel };
}

function drag(from: [number, number], to: [number, number], target: Element = screen.getByTestId('image-cloze-canvas')) {
  const canvas = screen.getByTestId('image-cloze-canvas');
  fireEvent.pointerDown(target, { pointerId: 20, button: 0, clientX: from[0], clientY: from[1] });
  fireEvent.pointerMove(canvas, { pointerId: 20, clientX: to[0], clientY: to[1] });
  fireEvent.pointerUp(canvas, { pointerId: 20 });
}

it('draws a focus area on the original image, previews the dimmed outside and saves it in original-image coordinates', async () => {
  const { onSaveRect, onConfirm } = open();
  fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
  expect(screen.getByRole('button', { name: 'Focus' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Remove focus' })).toBeDisabled();
  drag([80, 260], [320, 340]);
  const area = screen.getByLabelText('Focus area');
  expect(area).toHaveAttribute('data-image-rect-kind', 'focus');
  expect(document.querySelector('[data-image-rect-shade="focus"]')).not.toBeNull();
  // Unsaved focus keeps the other tools closed so one confirmation never mixes two edits.
  expect(screen.getByRole('button', { name: 'Cloze' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Crop' })).toBeDisabled();
  drag([160, 280], [240, 300], area);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(onSaveRect).toHaveBeenCalledOnce());
  const [kind, rect] = onSaveRect.mock.calls[0]! as unknown as ['focus', { x: number; y: number; width: number; height: number }];
  expect(kind).toBe('focus');
  expect(rect.x).toBeCloseTo(0.45); expect(rect.y).toBeCloseTo(0.45);
  expect(rect.width).toBeCloseTo(0.3); expect(rect.height).toBeCloseTo(0.2);
  expect(onConfirm).not.toHaveBeenCalled();
});

it('shows a saved crop with handles, resizes it, and removes it as a cleared crop', async () => {
  const { onSaveRect } = open({ focus: null, crop: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 } });
  fireEvent.click(screen.getByRole('button', { name: 'Crop' }));
  const area = screen.getByLabelText('Crop area');
  expect(area).toHaveStyle({ left: '25%', width: '50%' });
  expect(area.querySelectorAll('[data-cloze-handle]').length).toBe(4);
  drag([400, 300], [480, 340], area.querySelector('[data-cloze-handle="se"]')!);
  expect(screen.getByLabelText('Crop area')).toHaveStyle({ width: '60%' });
  fireEvent.click(screen.getByRole('button', { name: 'Remove crop' }));
  expect(screen.queryByLabelText('Crop area')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(onSaveRect).toHaveBeenCalledWith('crop', null));
});

it('closes without saving when nothing changed, keeps the area after a failed save and retries the same rectangle', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('image_rect_source_changed')).mockResolvedValueOnce(undefined);
  const { onCancel } = open({ focus: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }, crop: null }, save);
  fireEvent.click(screen.getByRole('button', { name: 'Focus' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(onCancel).toHaveBeenCalledOnce();
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Remove focus' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Your changes are kept');
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
  expect(save.mock.calls[1]).toEqual(['focus', null]);
});

it('keeps the cloze tool unchanged and offers no focus or crop for images that cannot carry them', () => {
  renderWithLocalization(<CompanionImageClozeEditor attachmentId={hash} src="data:image/png;base64,png" onConfirm={vi.fn(async () => {})} onCancel={vi.fn()} />);
  fireEvent.load(screen.getByAltText('Original image'));
  expect(screen.getByRole('heading', { name: 'Image cloze' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Focus' })).toBeNull();
  drawImageClozeMask();
  expect(screen.getByLabelText('Mask 1')).not.toHaveAttribute('data-image-rect-kind');
});

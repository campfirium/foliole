import { fireEvent, screen } from '@testing-library/react';

export function drawImageClozeMask() {
  const create = screen.getByRole('button', { name: 'New mask' });
  if (create.getAttribute('aria-pressed') !== 'true') fireEvent.click(create);
  const canvas = screen.getByTestId('image-cloze-canvas');
  fireEvent.pointerDown(canvas, { pointerId: 10, button: 0, clientX: 80, clientY: 260 });
  fireEvent.pointerMove(canvas, { pointerId: 10, clientX: 320, clientY: 340 });
  fireEvent.pointerUp(canvas, { pointerId: 10 });
}

export function installImageClozePointerEvents() {
  return class extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1; }
  };
}

export function tapImageClozeMask(mask: Element) {
  const canvas = screen.getByTestId('image-cloze-canvas');
  fireEvent.pointerDown(mask, { pointerId: 11, button: 0, clientX: 160, clientY: 260 });
  fireEvent.pointerUp(canvas, { pointerId: 11, clientX: 160, clientY: 260 });
}

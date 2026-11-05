import { fireEvent, screen } from '@testing-library/react';

export function drawImageClozeMask() {
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

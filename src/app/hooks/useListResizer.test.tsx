import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { useListResizer } from './useListResizer';

function Harness() {
  const [width, setWidth] = useState(300);
  const { handleSplitterPointerDown, isResizingList } = useListResizer(width, setWidth);

  return (
    <>
      <div data-testid="list-width">{width}</div>
      <div data-testid="is-resizing">{String(isResizingList)}</div>
      <button
        onClick={() =>
          handleSplitterPointerDown({
            clientX: 300,
            preventDefault: () => undefined
          } as ReactPointerEvent<HTMLDivElement>)
        }
        type="button"
      >
        Start resize
      </button>
      <div aria-label="Resize topic list" onPointerDown={handleSplitterPointerDown} role="separator" />
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('updates list width from pointer drag on desktop', async () => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: 1440,
    writable: true
  });

  const pointerListeners = new Map<string, EventListener>();
  vi.spyOn(window, 'addEventListener').mockImplementation(((type: string, listener: EventListenerOrEventListenerObject) => {
    if (typeof listener === 'function') {
      pointerListeners.set(type, listener);
    }
  }) as typeof window.addEventListener);

  render(<Harness />);

  fireEvent.click(screen.getByRole('button', { name: 'Start resize' }));

  await waitFor(() => {
    expect(pointerListeners.has('pointermove')).toBe(true);
  });

  const pointerMove = pointerListeners.get('pointermove');
  const pointerUp = pointerListeners.get('pointerup');
  if (!pointerMove || !pointerUp) {
    throw new Error('expected resize listeners');
  }

  act(() => {
    pointerMove({ clientX: 348 } as PointerEvent);
  });
  expect(screen.getByTestId('list-width').textContent).toBe('348');

  act(() => {
    pointerUp(new Event('pointerup'));
  });
  await waitFor(() => {
    expect(screen.getByTestId('is-resizing').textContent).toBe('false');
  });
});

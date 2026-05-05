import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { useRightSidebarResizer } from './useRightSidebarResizer';

function Harness() {
  const [width, setWidth] = useState(320);
  const { handleRightSidebarSplitterPointerDown, isResizingRightSidebar } = useRightSidebarResizer(
    width,
    setWidth
  );

  return (
    <>
      <div data-testid="right-sidebar-width">{width}</div>
      <div data-testid="is-resizing">{String(isResizingRightSidebar)}</div>
      <button
        onClick={() =>
          handleRightSidebarSplitterPointerDown({
            clientX: 1120,
            preventDefault: () => undefined
          } as ReactPointerEvent<HTMLDivElement>)
        }
        type="button"
      >
        Start resize
      </button>
      <div
        aria-label="Resize inspector sidebar"
        onPointerDown={handleRightSidebarSplitterPointerDown}
        role="separator"
      />
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('updates right sidebar width from pointer drag on desktop', async () => {
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
    pointerMove({ clientX: 1040 } as PointerEvent);
  });
  expect(screen.getByTestId('right-sidebar-width').textContent).toBe('400');

  act(() => {
    pointerUp(new Event('pointerup'));
  });
  await waitFor(() => {
    expect(screen.getByTestId('is-resizing').textContent).toBe('false');
  });
});

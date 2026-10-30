import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { StartupLoadingSurface } from './StartupLoadingSurface';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it('reveals a spinner at 300ms and text at 2s without restarting on progress updates', async () => {
  vi.useFakeTimers();
  const { container, rerender } = render(<StrictMode><StartupLoadingSurface title="Starting Foliole" /></StrictMode>);
  await act(() => vi.advanceTimersByTimeAsync(299));
  expect(container.textContent).toBe('');
  expect(container.querySelector('.animate-spin')).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(container.querySelector('.animate-spin')).not.toBeNull();
  expect(container.textContent).toBe('');
  await act(() => vi.advanceTimersByTimeAsync(1699));
  rerender(<StrictMode><StartupLoadingSurface title="Updating your library" progress={{ completed: 2, total: 4 }} /></StrictMode>);
  expect(screen.queryByRole('heading')).toBeNull();
  await act(() => vi.advanceTimersByTimeAsync(1));
  expect(screen.getByRole('heading')).toHaveTextContent('Updating your library');
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  rerender(<StrictMode><StartupLoadingSurface title="Updating your library" progress={{ completed: 3, total: 4 }} /></StrictMode>);
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75');
});

it.each([100, 800, 2100])('cancels waiting immediately when completed at %dms', async (duration) => {
  vi.useFakeTimers();
  const { container, unmount } = render(<StartupLoadingSurface title="Starting Foliole" />);
  await act(() => vi.advanceTimersByTimeAsync(duration));
  unmount();
  expect(container).toBeEmptyDOMElement();
  expect(vi.getTimerCount()).toBe(0);
  await act(() => vi.advanceTimersByTimeAsync(3000));
  expect(container).toBeEmptyDOMElement();
});

it('keeps indeterminate work spinning without inventing progress', async () => {
  vi.useFakeTimers();
  const { container } = render(<StartupLoadingSurface title="Updating your library" progress={{ completed: 0, total: 0 }} />);
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(screen.getByRole('heading')).toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).toBeNull();
  expect(container.querySelector('.animate-spin')).not.toBeNull();
});

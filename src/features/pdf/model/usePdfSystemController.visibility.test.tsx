import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePdfSystemController } from './usePdfSystemController';

describe('usePdfSystemController visibility restore', () => {
  it('reissues a page jump when a cached pdf surface becomes visible again', () => {
    const { result, rerender } = renderHook(
      ({ isVisible }: { isVisible: boolean }) =>
        usePdfSystemController(
          {
            scrollTop: 450,
            selection: {
              from: 5,
              to: 0
            }
          },
          vi.fn(),
          '/tmp/sample.pdf',
          isVisible
        ),
      {
        initialProps: { isVisible: false }
      }
    );

    act(() => {
      result.current.actions.clearPageJumpRequest(result.current.state.pageJumpRequest?.id as number);
      result.current.actions.reportLoadSuccess(9);
    });

    expect(result.current.state.pageJumpRequest).toBeNull();

    rerender({ isVisible: true });

    expect(result.current.state.pageJumpRequest).toEqual({
      id: -1,
      page: 5,
      positionY: 0.45
    });
  });

  it('does not reissue a jump for the default first-page position', () => {
    const { result, rerender } = renderHook(
      ({ isVisible }: { isVisible: boolean }) =>
        usePdfSystemController(
          {
            scrollTop: 0,
            selection: {
              from: 1,
              to: 0
            }
          },
          vi.fn(),
          '/tmp/sample.pdf',
          isVisible
        ),
      {
        initialProps: { isVisible: false }
      }
    );

    act(() => {
      result.current.actions.reportLoadSuccess(9);
    });

    rerender({ isVisible: true });

    expect(result.current.state.pageJumpRequest).toBeNull();
  });
});

it('increases the fixed zoom beyond 200 percent and restores the saved value', () => {
  const persist = vi.fn();
  const viewState = { scrollTop: 450, selection: { from: 5, to: 200 } };
  const reader = renderHook(() => usePdfSystemController(viewState, persist, '/tmp/sample.pdf', true, 9));
  act(() => reader.result.current.actions.zoomIn());
  expect(reader.result.current.state.zoom).toBe(210);
  const saved = persist.mock.lastCall?.[0];
  expect(saved?.selection?.to).toBe(210);
  reader.unmount();
  const restored = renderHook(() => usePdfSystemController(saved, vi.fn(), '/tmp/sample.pdf', true, 9));
  expect(restored.result.current.state).toMatchObject({ zoom: 210, zoomMode: 'custom' });
});

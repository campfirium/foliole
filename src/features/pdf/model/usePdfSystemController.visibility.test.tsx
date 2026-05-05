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
});

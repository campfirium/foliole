import { act, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useFitWidthTargetWidth } from './PdfDocumentViewportSizing';

afterEach(() => vi.unstubAllGlobals());

it('follows the container when a vertical scrollbar narrows it after the first measurement', () => {
  let notify = () => {};
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { notify = callback; }
    observe() {}
    disconnect() {}
  });
  const container = document.createElement('div');
  let width = 858;
  Object.defineProperty(container, 'clientWidth', { get: () => width });
  const { result } = renderHook(() => useFitWidthTargetWidth({ current: container }));
  expect(result.current).toBe(810);
  width = 847;
  act(() => notify());
  expect(result.current).toBe(799);
});

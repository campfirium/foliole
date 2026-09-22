import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useSimplePdfPosition } from './useSimplePdfPosition';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const scroll = document.createElement('div');
  const row = document.createElement('div');
  row.dataset.listPositionIndex = '4';
  scroll.append(row);
  scroll.getBoundingClientRect = () => new DOMRect(0, 0, 400, 600);
  row.getBoundingClientRect = () => new DOMRect(0, 100, 400, 1000);
  scroll.scrollTo = vi.fn();
  const ref = { current: scroll };
  const hook = renderHook(({ width, page }) => useSimplePdfPosition(ref, width, page), { initialProps: { width: 100, page: 5 } });
  return { ...hook, scroll, row };
}

it('preserves the visible page and relative in-page position when zoom changes', () => {
  const { result, rerender, scroll, row } = setup();
  act(() => scroll.dispatchEvent(new Event('wheel')));
  act(() => result.current.position.write({ index: 4, key: '5', offset: 250, order: [] }));
  rerender({ width: 200, page: 5 });
  expect(result.current.position.read()).toMatchObject({ key: '5', offset: 500 });
  row.getBoundingClientRect = () => new DOMRect(0, 100, 800, 2000);
  act(() => { result.current.onLayoutReady(5); vi.advanceTimersByTime(20); });
  expect(scroll.scrollTo).toHaveBeenLastCalledWith({ top: 600 });
});

it('honors a new search target in the same PDF instead of restoring the previous target', () => {
  const { result, rerender, scroll } = setup();
  act(() => scroll.dispatchEvent(new Event('wheel')));
  act(() => result.current.position.write({ index: 4, key: '5', offset: 250, order: [] }));
  rerender({ width: 100, page: 9000 });
  expect(result.current.position.read()).toMatchObject({ key: '9000', index: 8999, offset: 0 });
});

it('stops automatic positioning immediately after user input and on unmount', () => {
  const { result, scroll, unmount } = setup();
  act(() => result.current.onLayoutReady(5));
  act(() => scroll.dispatchEvent(new Event('touchstart')));
  act(() => vi.advanceTimersByTime(20));
  expect(scroll.scrollTo).not.toHaveBeenCalled();
  expect(result.current.pinned).toBeNull();
  act(() => result.current.onLayoutReady(5));
  unmount();
  act(() => vi.runAllTimers());
  expect(scroll.scrollTo).not.toHaveBeenCalled();
});

it('bounds delayed corrections and releases a target even if rendering never completes', () => {
  const { result, scroll } = setup();
  for (let index = 0; index < 10; index++) act(() => { result.current.onLayoutReady(5); vi.advanceTimersByTime(20); });
  expect(vi.mocked(scroll.scrollTo).mock.calls.length).toBeLessThanOrEqual(6);
  act(() => vi.advanceTimersByTime(3000));
  expect(result.current.pinned).toBeNull();
});

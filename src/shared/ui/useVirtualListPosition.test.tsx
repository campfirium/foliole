import type { Virtualizer } from '@tanstack/react-virtual';
import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useVirtualListPosition } from './useVirtualListPosition';
import type { VirtualListAnchor, VirtualListPosition } from './virtualListPosition';

const keys = Array.from({ length: 120 }, (_, index) => `topic-${index}`);
const frames = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;

beforeEach(() => {
  frames.clear();
  nextFrameId = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = ++nextFrameId;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
});

afterEach(() => vi.restoreAllMocks());

function advanceFrame() {
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });
}

function PositionHarness(props: {
  position: VirtualListPosition;
  virtualizer: Virtualizer<HTMLElement, Element>;
}) {
  const scrollElementRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useVirtualListPosition({ keys, position: props.position, rootRef, scrollElementRef, virtualizer: props.virtualizer });
  return <div data-testid="scroll" ref={scrollElementRef}><div ref={rootRef} /></div>;
}

it('retains a saved deep anchor until the virtualizer can resolve its scroll offset', () => {
  const saved: VirtualListAnchor = { key: 'topic-102', index: 102, offset: 17, order: keys };
  let stored = saved;
  const position = {
    read: () => stored,
    write: vi.fn((anchor: VirtualListAnchor) => { stored = anchor; })
  };
  const runtime = {
    scrollElement: null as HTMLElement | null,
    shouldAdjustScrollPositionOnItemSizeChange: undefined,
    getOffsetForIndex: () => [runtime.scrollElement ? 19176 : 0, 'start'],
    getVirtualItemForOffset: (offset: number) => offset >= 19176
      ? { index: 102, start: 19176 }
      : { index: 0, start: 0 }
  };
  const virtualizer = runtime as unknown as Virtualizer<HTMLElement, Element>;
  render(<PositionHarness position={position} virtualizer={virtualizer} />);
  const scroll = screen.getByTestId('scroll');

  advanceFrame();
  expect(position.write).not.toHaveBeenCalled();
  expect(stored).toEqual(saved);

  runtime.scrollElement = scroll;
  advanceFrame();
  expect(scroll.scrollTop).toBe(19193);
  expect(position.write).toHaveBeenCalledWith(saved);
  expect(stored).toEqual(saved);
});

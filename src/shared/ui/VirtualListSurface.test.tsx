import { render, screen } from '@testing-library/react';
import { useRef, type ReactNode } from 'react';
import { expect, it } from 'vitest';

import { resolveComfortScrollTop, shouldVirtualizeList, VirtualListSurface } from './VirtualListSurface';

function VirtualListHarness(props: {
  children?: ReactNode;
  items: readonly string[];
  scrollToIndex?: number | null;
  threshold?: number;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  return (
    <div data-testid="scroll-container" ref={scrollRef} style={{ height: '120px', overflowY: 'auto' }}>
      <VirtualListSurface
        estimateSize={() => 24}
        getItemKey={(item) => item}
        items={props.items}
        renderItem={(item, meta) => (
          <div aria-posinset={meta.ariaPosInSet} aria-setsize={meta.ariaSetSize}>
            {item}
          </div>
        )}
        scrollElementRef={scrollRef}
        {...(props.scrollToIndex !== undefined ? { scrollToIndex: props.scrollToIndex } : {})}
        {...(props.threshold !== undefined ? { threshold: props.threshold } : {})}
      />
      {props.children}
    </div>
  );
}

function getVirtualList() {
  return document.querySelector('[data-virtual-list="true"]');
}

it('keeps short lists non-virtualized', () => {
  render(<VirtualListHarness items={['A', 'B', 'C']} />);

  expect(getVirtualList()).not.toBeInTheDocument();
  expect(screen.getByText('A')).toBeInTheDocument();
  expect(screen.getByText('C')).toHaveAttribute('aria-posinset', '3');
  expect(shouldVirtualizeList(99)).toBe(false);
  expect(shouldVirtualizeList(100)).toBe(true);
});

it('renders only the visible window for long lists', async () => {
  const items = Array.from({ length: 200 }, (_, index) => `Item ${index}`);

  render(<VirtualListHarness items={items} />);

  expect(await screen.findByText('Item 0')).toBeInTheDocument();
  expect(screen.queryByText('Item 199')).not.toBeInTheDocument();
  expect(screen.getAllByText(/Item /u).length).toBeLessThan(60);
  expect(screen.getByText('Item 0')).toHaveAttribute('aria-setsize', '200');
});

it('allows callers to override the virtualization threshold', () => {
  const items = Array.from({ length: 30 }, (_, index) => `Item ${index}`);

  render(<VirtualListHarness items={items} threshold={5} />);

  expect(getVirtualList()).toBeInTheDocument();
  expect(screen.queryByText('Item 29')).not.toBeInTheDocument();
});

it('keeps already visible scroll targets in place', () => {
  expect(resolveComfortScrollTop({
    containerHeight: 400,
    currentScrollTop: 500,
    itemEnd: 650,
    itemStart: 620,
    maxScrollTop: 2000
  })).toBeNull();
});

it('places offscreen scroll targets in a comfortable upper-middle viewport position', () => {
  expect(resolveComfortScrollTop({
    containerHeight: 400,
    currentScrollTop: 0,
    itemEnd: 1028,
    itemStart: 1000,
    maxScrollTop: 2000
  })).toBe(848);
});

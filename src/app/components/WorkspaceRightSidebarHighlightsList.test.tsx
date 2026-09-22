import { fireEvent, render, screen, within } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import {
  WorkspaceRightSidebarHighlightsList,
  type SidebarHighlightItem
} from './WorkspaceRightSidebarHighlightsList';

const ITEM_COUNT = 140;
const ROW_HEIGHT = 88;

function createHighlights(): SidebarHighlightItem[] {
  return Array.from({ length: ITEM_COUNT }, (_, index) => ({
    kind: 'highlight',
    nodeId: `highlight-${index}`,
    text: `Highlight ${index}`
  }));
}

function HighlightsListHarness(props: {
  highlights: SidebarHighlightItem[];
  onRevealHighlight: (nodeId: string) => void;
}) {
  const scrollElementRef = useRef<HTMLDivElement>(null);
  return (
    <div data-testid="scroll-element" ref={scrollElementRef} style={{ height: 320, overflowY: 'auto' }}>
      <WorkspaceRightSidebarHighlightsList
        ariaLabel="Document highlights"
        highlights={props.highlights}
        onRevealHighlight={props.onRevealHighlight}
        scrollElementRef={scrollElementRef}
      />
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

it('keeps the complete highlight extent while mounting only a viewport window', () => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(ROW_HEIGHT);
  const onRevealHighlight = vi.fn();
  render(<HighlightsListHarness highlights={createHighlights()} onRevealHighlight={onRevealHighlight} />);

  const list = screen.getByRole('list', { name: 'Document highlights' });
  const virtualList = document.querySelector('[data-virtual-list="true"]') as HTMLElement;
  expect(virtualList).toBeInTheDocument();
  expect(virtualList.style.height).toBe(`${ITEM_COUNT * ROW_HEIGHT}px`);
  expect(within(list).getAllByRole('listitem').length).toBeLessThan(ITEM_COUNT);
  const firstButton = screen.getByRole('button', { name: 'Highlight 0' });
  const firstItem = firstButton.closest('[role="listitem"]');
  expect(firstItem).toHaveAttribute('aria-posinset', '1');
  expect(firstItem).toHaveAttribute('aria-setsize', String(ITEM_COUNT));
  expect(screen.queryByRole('button', { name: `Highlight ${ITEM_COUNT - 1}` })).not.toBeInTheDocument();

  fireEvent.click(firstButton);
  expect(onRevealHighlight).toHaveBeenCalledWith('highlight-0');
});

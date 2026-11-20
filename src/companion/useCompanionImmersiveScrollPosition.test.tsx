import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCompanionImmersiveScrollPosition } from './useCompanionImmersiveScrollPosition';

function ScrollSurface(props: { nodeId?: string; onScrollTopChange(scrollTop: number): void; restoreScrollTop: number }) {
  const position = useCompanionImmersiveScrollPosition(props.nodeId ?? 'topic-1', props.restoreScrollTop, props.onScrollTopChange);
  return <section data-testid="surface" onScroll={position.handleScroll} ref={position.surfaceRef} />;
}

describe('useCompanionImmersiveScrollPosition', () => {
  it('restores and reports the outer article scroll position', () => {
    const onScrollTopChange = vi.fn();
    const view = render(<ScrollSurface onScrollTopChange={onScrollTopChange} restoreScrollTop={5400} />);

    const surface = screen.getByTestId('surface');
    expect(surface.scrollTop).toBe(5400);
    fireEvent.scroll(surface, { target: { scrollTop: 5744 } });
    expect(onScrollTopChange).toHaveBeenCalledWith(5744);
    view.rerender(<ScrollSurface nodeId="topic-2" onScrollTopChange={onScrollTopChange} restoreScrollTop={0} />);
    expect(surface.scrollTop).toBe(0);
  });

  it('applies a saved position that reaches the open article before the reader acts', () => {
    const view = render(<ScrollSurface onScrollTopChange={vi.fn()} restoreScrollTop={2392} />);
    const surface = screen.getByTestId('surface');
    view.rerender(<ScrollSurface onScrollTopChange={vi.fn()} restoreScrollTop={3564} />);
    expect(surface.scrollTop).toBe(3564);
  });

  it('keeps the reader position when a later refresh carries an older saved position', () => {
    const view = render(<ScrollSurface onScrollTopChange={vi.fn()} restoreScrollTop={0} />);
    const surface = screen.getByTestId('surface');
    fireEvent.touchStart(surface);
    fireEvent.scroll(surface, { target: { scrollTop: 2177 } });
    view.rerender(<ScrollSurface onScrollTopChange={vi.fn()} restoreScrollTop={4828} />);
    expect(surface.scrollTop).toBe(2177);
    view.rerender(<ScrollSurface nodeId="topic-2" onScrollTopChange={vi.fn()} restoreScrollTop={640} />);
    expect(surface.scrollTop).toBe(640);
  });
});

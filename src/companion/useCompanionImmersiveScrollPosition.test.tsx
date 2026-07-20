import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useCompanionImmersiveScrollPosition } from './useCompanionImmersiveScrollPosition';

function ScrollSurface(props: { onScrollTopChange(scrollTop: number): void; restoreScrollTop: number }) {
  const position = useCompanionImmersiveScrollPosition('topic-1', props.restoreScrollTop, props.onScrollTopChange);
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
    view.rerender(<ScrollSurface onScrollTopChange={onScrollTopChange} restoreScrollTop={0} />);
    expect(surface.scrollTop).toBe(0);
  });
});

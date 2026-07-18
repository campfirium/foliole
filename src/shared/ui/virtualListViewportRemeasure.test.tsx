import type { Virtualizer } from '@tanstack/react-virtual';
import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { useVirtualListViewportRemeasure } from './virtualListViewportRemeasure';

function RemeasureHarness({
  isVirtual,
  measure
}: {
  isVirtual: boolean;
  measure: () => void;
}) {
  useVirtualListViewportRemeasure({
    isVirtual,
    virtualizer: { measure } as Virtualizer<HTMLElement, Element>
  });
  return null;
}

beforeEach(() => {
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

it('remeasures virtual rows on mount and after viewport resize events', async () => {
  const measure = vi.fn();
  const addEventListener = vi.spyOn(window, 'addEventListener');
  render(<RemeasureHarness isVirtual measure={measure} />);
  await waitFor(() => expect(addEventListener).toHaveBeenCalledWith('resize', expect.any(Function)));

  expect(measure).toHaveBeenCalledTimes(2);

  window.dispatchEvent(new Event('resize'));

  expect(measure).toHaveBeenCalledTimes(4);
});

it('does not bind viewport remeasure listeners for static rows', () => {
  const measure = vi.fn();
  render(<RemeasureHarness isVirtual={false} measure={measure} />);

  window.dispatchEvent(new Event('resize'));

  expect(measure).not.toHaveBeenCalled();
});

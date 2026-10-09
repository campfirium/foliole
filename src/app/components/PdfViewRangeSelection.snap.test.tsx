import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { PdfViewRangeSelection } from './PdfViewRangeSelection';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('snaps a resized edge to content and releases it when dragged farther away', () => {
  vi.stubGlobal('PointerEvent', MouseEvent);
  const onChange = vi.fn();
  const rect = { x: .1, y: .2, width: .6, height: .5 };
  const props = { rect, onChange, guides: { x: [.1, .7], y: [.2, .7] } };
  render(<PdfViewRangeSelection {...props} />);
  const selection = screen.getByTestId('pdf-view-range-selection');
  selection.setPointerCapture = vi.fn();
  selection.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 }) as DOMRect;
  const corner = selection.querySelector('[data-handle="se"]');
  if (!corner) throw new Error('Missing range handle');
  fireEvent.pointerDown(corner, { clientX: 700, clientY: 700 });
  fireEvent.pointerMove(selection, { clientX: 704, clientY: 704 });
  expect(onChange.mock.lastCall?.[0].x + onChange.mock.lastCall?.[0].width).toBeCloseTo(.7);
  expect(screen.getByTestId('pdf-range-snap-vertical')).toBeInTheDocument();
  fireEvent.pointerMove(selection, { clientX: 760, clientY: 760 });
  expect(onChange.mock.lastCall?.[0].x + onChange.mock.lastCall?.[0].width).toBeCloseTo(.76);
  expect(screen.queryByTestId('pdf-range-snap-vertical')).not.toBeInTheDocument();
});

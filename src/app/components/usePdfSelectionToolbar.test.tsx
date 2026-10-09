import { fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, expect, it } from 'vitest';

import { usePdfSelectionToolbar } from './usePdfSelectionToolbar';

function SelectionSurface() {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState('');
  const [revision, setRevision] = useState(0);
  usePdfSelectionToolbar({
    surfaceRef,
    onClose: () => setSelected(''),
    onOpen: snapshot => setSelected(snapshot.selectionText)
  });
  return <>
    <div data-pdf-page-number="1" data-testid="pdf" ref={surfaceRef} onMouseMove={() => setRevision(revision + 1)}><span>Selected PDF text</span></div>
    <div data-testid="outside">Outside PDF</div>
    {selected && <div role="toolbar" data-annotation-toolbar="true">{selected}</div>}
  </>;
}

function selectPdfText() {
  const surface = screen.getByTestId('pdf');
  const text = surface.querySelector('span')?.firstChild;
  if (!text) throw new Error('PDF text unavailable');
  window.getSelection()?.setBaseAndExtent(text, 0, text, 8);
  return surface;
}

afterEach(() => window.getSelection()?.removeAllRanges());

it('opens the toolbar when a PDF drag finishes outside the surface after live selection updates', () => {
  render(<SelectionSurface />);
  const surface = selectPdfText();
  fireEvent.mouseDown(surface, { button: 0 });
  fireEvent.mouseMove(surface, { buttons: 1 });
  fireEvent.mouseUp(screen.getByTestId('outside'), { button: 0 });
  expect(screen.getByRole('toolbar')).toHaveTextContent('Selected');
});

it('does not reopen a retained PDF selection after an unrelated outside click', () => {
  render(<SelectionSurface />);
  const surface = selectPdfText();
  fireEvent.mouseUp(surface, { button: 0 });
  expect(screen.getByRole('toolbar')).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByTestId('outside'), { button: 0 });
  fireEvent.mouseUp(screen.getByTestId('outside'), { button: 0 });
  expect(screen.queryByRole('toolbar')).toBeNull();
});

import { fireEvent, render, screen } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { afterEach, expect, it } from 'vitest';

import { usePdfSelectionToolbar } from './usePdfSelectionToolbar';

function SelectionSurface({ synchronousRelease = false }: { synchronousRelease?: boolean }) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const [selected, setSelected] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!synchronousRelease) return undefined;
    const updateOverlay = () => flushSync(() => setRevision(value => value + 1));
    document.addEventListener('mouseup', updateOverlay, true);
    return () => document.removeEventListener('mouseup', updateOverlay, true);
  }, [synchronousRelease]);
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
  fireEvent(document, new Event('selectionchange'));
  expect(screen.queryByRole('toolbar')).toBeNull();
});

it('opens the toolbar when the native selection finishes after mouse release', () => {
  render(<SelectionSurface />);
  const surface = screen.getByTestId('pdf');
  fireEvent.mouseDown(surface, { button: 0 });
  fireEvent.mouseUp(surface, { button: 0 });
  expect(screen.queryByRole('toolbar')).toBeNull();
  selectPdfText();
  fireEvent(document, new Event('selectionchange'));
  expect(screen.getByRole('toolbar')).toHaveTextContent('Selected');
});

it('keeps the toolbar dismissed after Escape when selection events arrive later', () => {
  render(<SelectionSurface />);
  const surface = selectPdfText();
  fireEvent.mouseUp(surface, { button: 0 });
  fireEvent.keyUp(surface, { key: 'Escape' });
  fireEvent(document, new Event('selectionchange'));
  expect(screen.queryByRole('toolbar')).toBeNull();
});

it('opens the toolbar when the live selection synchronously rerenders during release', () => {
  render(<SelectionSurface synchronousRelease />);
  const surface = selectPdfText();
  fireEvent.mouseDown(surface, { button: 0 });
  fireEvent.mouseUp(surface, { button: 0 });
  expect(screen.getByRole('toolbar')).toHaveTextContent('Selected');
});

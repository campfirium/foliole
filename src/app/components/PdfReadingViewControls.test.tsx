import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import {
  PdfReadingViewProvider,
  usePdfReadingView
} from '../../features/pdf/components/PdfReadingViewContext';
import { measurePdfAutomaticView } from '../../features/pdf/model/measurePdfAutomaticView';
import {
  DEFAULT_PDF_READING_VIEW,
  type PdfReadingView
} from '../../features/pdf/model/pdfReadingView';
import {
  loadPdfReadingView,
  savePdfReadingView
} from '../../features/pdf/model/pdfReadingViewRepository';

import { PdfPageFrame } from './PdfPageFrame';
import { PdfReadingViewControls } from './PdfReadingViewControls';

vi.mock('../../features/pdf/model/pdfReadingViewRepository', () => ({
  loadPdfReadingView: vi.fn(),
  savePdfReadingView: vi.fn()
}));
vi.mock('../../features/pdf/model/measurePdfAutomaticView', () => ({
  measurePdfAutomaticView: vi.fn()
}));
const automatic = { x: 0.1, y: 0.15, width: 0.8, height: 0.75 };
const manual = { x: 0.2, y: 0.2, width: 0.6, height: 0.6 };
const pdf = { fingerprints: ['test-document'] } as PDFDocumentProxy;
let stored: PdfReadingView;
beforeEach(() => {
  stored = DEFAULT_PDF_READING_VIEW;
  vi.mocked(loadPdfReadingView).mockImplementation(async () => stored);
  vi.mocked(savePdfReadingView).mockImplementation(async (_, view) => {
    stored = view;
  });
  vi.mocked(measurePdfAutomaticView).mockResolvedValue(automatic);
  vi.clearAllMocks();
});
function Reader() {
  const runtime = usePdfReadingView();
  useEffect(() => {
    if (runtime) void runtime.initialize(pdf);
  }, [runtime]);
  return (
    <>
      <PdfReadingViewControls onInteraction={() => undefined} />
      <PdfPageFrame pageDimensions={{ width: 600, height: 800 }}>
        <span>Body and footnote</span>
      </PdfPageFrame>
      {runtime?.editing ? (
        <div role="dialog">
          <button onClick={runtime.cancel}>Cancel selection</button>
          <button
            onClick={() => {
              void runtime.confirm(manual);
            }}
          >
            Save selection
          </button>
        </div>
      ) : null}
    </>
  );
}
const reader = (
  <PdfReadingViewProvider page={1}>
    <Reader />
  </PdfReadingViewProvider>
);
it('starts in automatic view, cancels selection without saving, then remembers manual view after reopening', async () => {
  const mounted = render(reader);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Custom fit' })).toBeEnabled());
  expect(screen.getByTestId('pdf-document-page-frame')).toHaveStyle({
    width: '600px',
    height: '800px'
  });
  const writes = vi.mocked(savePdfReadingView).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Custom fit' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Cancel selection'));
  expect(vi.mocked(savePdfReadingView).mock.calls.length).toBe(writes);
  fireEvent.click(screen.getByRole('button', { name: 'Custom fit' }));
  fireEvent.click(screen.getByText('Save selection'));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(stored).toEqual({ mode: 'manual', automatic, manual, automaticVersion: 1 });
  mounted.unmount();
  render(reader);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Custom fit' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  );
  expect(vi.mocked(measurePdfAutomaticView)).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('pdf-document-page-frame')).toHaveStyle({
    width: '600px',
    height: '800px'
  });
});
it('switches modes without losing the saved manual range and allows adjusting it', async () => {
  stored = { mode: 'manual', automatic, manual };
  render(reader);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Auto fit' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Auto fit' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Auto fit' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  );
  expect(stored.manual).toEqual(manual);
  expect(screen.getByTestId('pdf-document-page-frame')).toHaveStyle({ width: '600px', height: '800px' });
  expect(document.querySelector('.pdf-document-page-crop-content')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Custom fit' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Custom fit' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByTestId('pdf-document-page-frame')).toHaveStyle({ width: '600px', height: '800px' });
  expect(screen.queryByRole('button', { name: 'Adjust range' })).not.toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('button', { name: 'Custom fit options' }), { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Adjust range' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
it('reports a failed save while retaining the previous view and the open selection', async () => {
  render(reader);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Custom fit' })).toBeEnabled());
  vi.mocked(savePdfReadingView).mockRejectedValueOnce(new Error('storage failed'));
  fireEvent.click(screen.getByRole('button', { name: 'Custom fit' }));
  fireEvent.click(screen.getByText('Save selection'));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Auto fit' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

it('shows mode names on hover instead of taking toolbar space with text buttons', async () => {
  render(reader);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Custom fit' })).toBeEnabled());
  expect(screen.getByRole('button', { name: 'Auto fit' })).toHaveTextContent('');
  expect(screen.getByRole('button', { name: 'Custom fit' })).toHaveTextContent('');
  expect(screen.queryByText('Adjust range')).not.toBeInTheDocument();
});
it('replaces a stale automatic range without losing the saved manual range or mode', async () => {
  stored = { mode: 'manual', automatic: { x: 0, y: 0, width: 1, height: 1 }, manual };
  render(reader);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Custom fit' })).toBeEnabled());
  expect(stored.automatic).toEqual(automatic);
  expect(stored.manual).toEqual(manual);
  expect(stored.mode).toBe('manual');
});

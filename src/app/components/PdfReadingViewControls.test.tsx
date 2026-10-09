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

import { PdfPageCropFrame } from './PdfPageCropFrame';
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
      <PdfPageCropFrame pageDimensions={{ width: 600, height: 800 }}>
        {() => <span>Body and footnote</span>}
      </PdfPageCropFrame>
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
  await waitFor(() => expect(screen.getByRole('button', { name: 'Manual view' })).toBeEnabled());
  expect(screen.getByTestId('pdf-document-page-crop-frame')).toHaveStyle({
    width: '480px',
    height: '600px'
  });
  const writes = vi.mocked(savePdfReadingView).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Manual view' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Cancel selection'));
  expect(vi.mocked(savePdfReadingView).mock.calls.length).toBe(writes);
  fireEvent.click(screen.getByRole('button', { name: 'Manual view' }));
  fireEvent.click(screen.getByText('Save selection'));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(stored).toEqual({ mode: 'manual', automatic, manual });
  mounted.unmount();
  render(reader);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Manual view' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  );
  expect(vi.mocked(measurePdfAutomaticView)).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('pdf-document-page-crop-frame')).toHaveStyle({
    width: '360px',
    height: '480px'
  });
});
it('switches modes without losing the saved manual range and allows adjusting it', async () => {
  stored = { mode: 'manual', automatic, manual };
  render(reader);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Automatic view' })).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Automatic view' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Automatic view' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  );
  expect(stored.manual).toEqual(manual);
  fireEvent.click(screen.getByRole('button', { name: 'Manual view' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Manual view' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Adjust range' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});
it('reports a failed save while retaining the previous view and the open selection', async () => {
  render(reader);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Manual view' })).toBeEnabled());
  vi.mocked(savePdfReadingView).mockRejectedValueOnce(new Error('storage failed'));
  fireEvent.click(screen.getByRole('button', { name: 'Manual view' }));
  fireEvent.click(screen.getByText('Save selection'));
  await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Automatic view' })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
});

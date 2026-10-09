import { render, screen, waitFor } from '@testing-library/react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect } from 'react';
import { expect, it, vi } from 'vitest';

import { PdfReadingViewProvider, usePdfReadingView } from '../../features/pdf/components/PdfReadingViewContext';

import { PdfReadingViewEditor } from './PdfReadingViewEditor';

const body = { x: .1, y: .15, width: .8, height: .75 };
vi.mock('react-pdf', () => ({ Page: () => <div /> }));
vi.mock('../../features/pdf/model/pdfReadingViewRepository', () => ({
  loadPdfReadingView: async () => ({ mode: 'auto', automatic: body, automaticVersion: 1, manual: null }),
  savePdfReadingView: vi.fn()
}));
const pdf = { fingerprints: ['editor'], getPage: async () => ({
  getViewport: () => ({ width: 600, height: 800 }), getTextContent: async () => ({ items: [] })
}) } as unknown as PDFDocumentProxy;
function Editor() {
  const runtime = usePdfReadingView();
  useEffect(() => { void runtime?.initialize(pdf); }, [runtime]);
  return runtime?.ready ? <PdfReadingViewEditor pdf={pdf} /> : null;
}
it('starts manual adjustment from the automatic range instead of the full page', async () => {
  render(<PdfReadingViewProvider page={1}><Editor /></PdfReadingViewProvider>);
  const selection = await screen.findByTestId('pdf-view-range-selection');
  await waitFor(() => expect(selection.querySelector('[data-handle="move"]')).toHaveStyle({
    left: '10%', top: '15%', width: '80%', height: '75%'
  }));
});

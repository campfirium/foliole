import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';

import { LocalizationProvider } from '../../shared/localization/LocalizationProvider';
import { preloadTranslationCatalog } from '../../shared/localization/translations';
import { useWorkspaceStore } from '../../store/workspaceStore';

import { usePdfSelectionContextMenu } from './PdfSelectionContextMenu';
import { onPdfVisualSelectionKindChange, setPdfVisualSelectionKind } from './pdfSurfaceRegistration';
import { PdfVisualExcerptPageLayer } from './PdfVisualExcerptPageLayer';
import { PdfVisualExcerptRuntimeProvider, usePdfVisualExcerptRuntime } from './PdfVisualExcerptRuntime';

vi.mock('./pdfVisualExcerptRenderer', () => ({
  renderPdfVisualExcerpt: vi.fn(async () => new Uint8Array([1, 2, 3]))
}));

const createPdfImageExcerpt = vi.fn();

function AnnotationHarness() {
  return (
    <LocalizationProvider initialLanguagePreference="en">
      <PdfVisualExcerptRuntimeProvider currentPage={1} locators={[]} nodeId="pdf-1" rotation={0} source="fixture.pdf">
        <RegisterPage />
        <div data-testid="page-root">
          <canvas data-testid="pdf-canvas" />
          <PdfVisualExcerptPageLayer pageNumber={1} />
        </div>
      </PdfVisualExcerptRuntimeProvider>
    </LocalizationProvider>
  );
}

function RegisterPage() {
  const runtime = usePdfVisualExcerptRuntime();
  return <button data-testid="register-pdf-page" onClick={() => runtime.registerPage(1, {} as never)} />;
}

function preparePageRoot() {
  const root = screen.getByTestId('page-root');
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({
    bottom: 100, height: 100, left: 0, right: 100, top: 0, width: 100, x: 0, y: 0, toJSON: () => ({})
  });
  root.setPointerCapture = vi.fn();
  root.hasPointerCapture = vi.fn(() => false);
}

function dispatchPointer(type: 'pointerdown' | 'pointerup', clientX: number, clientY: number, pointerId: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: 0 }, clientX: { value: clientX }, clientY: { value: clientY },
    isPrimary: { value: true }, pointerId: { value: pointerId }
  });
  screen.getByTestId('pdf-canvas').dispatchEvent(event);
}

function selectNoteRegion(start: [number, number], end: [number, number], pointerId: number) {
  act(() => setPdfVisualSelectionKind('note'));
  act(() => {
    dispatchPointer('pointerdown', start[0], start[1], pointerId);
    dispatchPointer('pointerup', end[0], end[1], pointerId);
  });
}

beforeAll(async () => {
  await preloadTranslationCatalog('en');
});

beforeEach(() => {
  createPdfImageExcerpt.mockReset();
  createPdfImageExcerpt.mockResolvedValue('created-excerpt');
  useWorkspaceStore.setState({ createPdfImageExcerpt, nodesById: {} });
});

it('routes a note command without text selection into PDF visual selection', () => {
  window.getSelection()?.removeAllRanges();
  const received: Array<string | null> = [];
  const unlisten = onPdfVisualSelectionKindChange((kind) => received.push(kind));
  const { result } = renderHook(() => usePdfSelectionContextMenu({
    nodeId: 'pdf-1', onCreateHighlightFromSelection: vi.fn()
  }));

  act(() => expect(result.current.requestAnnotation('note')).toBe(true));

  expect(received).toEqual(['note']);
  unlisten();
});

it('creates one annotated image excerpt only after the PDF region note is saved', async () => {
  render(<AnnotationHarness />);
  preparePageRoot();
  const digest = vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new Uint8Array(32).buffer);
  fireEvent.click(screen.getByTestId('register-pdf-page'));
  selectNoteRegion([10, 15], [50, 55], 4);

  const input = await screen.findByRole('textbox');
  expect(createPdfImageExcerpt).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'Diagram thought' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(createPdfImageExcerpt).toHaveBeenCalledWith(
    'pdf-1',
    expect.objectContaining({ page: 1, rects: [expect.objectContaining({ height: 0.4, width: 0.4, x: 0.1, y: 0.15 })] }),
    null,
    '0'.repeat(64), 'AQID',
    `![Image excerpt](asset://${'0'.repeat(64)}.png)\n※ Diagram thought`
  ));
  await waitFor(() => expect(screen.queryByRole('textbox')).not.toBeInTheDocument());
  digest.mockRestore();
});

it('leaves no excerpt when the PDF region note is cancelled', async () => {
  render(<AnnotationHarness />);
  preparePageRoot();
  selectNoteRegion([10, 15], [50, 55], 5);
  await screen.findByRole('textbox');

  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(createPdfImageExcerpt).not.toHaveBeenCalled();
});

it('ignores a PDF note region smaller than the existing minimum size', () => {
  render(<AnnotationHarness />);
  preparePageRoot();
  selectNoteRegion([10, 10], [15, 15], 6);

  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(createPdfImageExcerpt).not.toHaveBeenCalled();
});

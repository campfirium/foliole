import { act, renderHook, waitFor } from '@testing-library/react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useEffect, type ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { PdfReadingViewProvider, usePdfReadingView } from '../../features/pdf/components/PdfReadingViewContext';
import { loadPdfReadingView, savePdfReadingView } from '../../features/pdf/model/pdfReadingViewRepository';

import { usePdfHeightFitView } from './usePdfHeightFitView';

vi.mock('../../features/pdf/model/pdfReadingViewRepository', () => ({ loadPdfReadingView: vi.fn(), savePdfReadingView: vi.fn() }));
const automatic = { x: 0.1, y: 0.1, width: 0.8, height: 0.75 };
const pdf = { fingerprints: ['height-fit'] } as PDFDocumentProxy;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadPdfReadingView).mockResolvedValue({ mode: 'auto', automatic, manual: null });
  vi.mocked(savePdfReadingView).mockResolvedValue();
});
function Initialize(props: { children: ReactNode }) {
  const runtime = usePdfReadingView();
  useEffect(() => { if (runtime) void runtime.initialize(pdf); }, [runtime]);
  return props.children;
}
function Wrapper(props: { children: ReactNode }) {
  return <PdfReadingViewProvider page={1}><Initialize>{props.children}</Initialize></PdfReadingViewProvider>;
}
function makeProps() {
  const container = document.createElement('div');
  Object.defineProperty(container, 'clientHeight', { value: 616 });
  return {
    scrollContainerRef: { current: container }, pageElementsRef: { current: {} },
    pageJumpRequest: null, persistedPageDimensions: { 1: { width: 600, height: 800 } },
    rotation: 0, zoom: 200, zoomMode: 'custom' as const,
    onSetZoom: vi.fn(), onSetFitWidth: vi.fn(), onZoomIn: vi.fn(), onZoomOut: vi.fn()
  };
}
it('overrides old zoom with content-height fit, then remembers free zoom without discarding ranges', async () => {
  const props = makeProps();
  const { result } = renderHook(() => usePdfHeightFitView(props, false), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.props.zoom).toBe(100));
  await act(async () => { result.current.props.onSetZoom(125); });
  await waitFor(() => expect(props.onSetZoom).toHaveBeenCalledWith(125));
  expect(savePdfReadingView).toHaveBeenCalledWith('height-fit', { mode: 'free', automatic, manual: null });
  expect(result.current.props.zoom).toBe(200);
});
it('does not leave height fit when the free-zoom preference cannot be saved', async () => {
  vi.mocked(savePdfReadingView).mockRejectedValue(new Error('save failed'));
  const props = makeProps();
  const { result } = renderHook(() => usePdfHeightFitView(props, false), { wrapper: Wrapper });
  await waitFor(() => expect(result.current.props.zoom).toBe(100));
  await act(async () => { result.current.props.onSetFitWidth(); });
  expect(props.onSetFitWidth).not.toHaveBeenCalled();
  expect(result.current.props.zoom).toBe(100);
});
it('aligns once and leaves subsequent continuous scrolling alone', async () => {
  const base = makeProps();
  const shell = document.createElement('div');
  const props = { ...base, pageElementsRef: { current: { 1: shell } } };
  const { result, rerender } = renderHook(() => usePdfHeightFitView(props, true), { wrapper: Wrapper });
  await waitFor(() => expect(base.scrollContainerRef.current.scrollTop).toBe(72));
  base.scrollContainerRef.current.scrollTop = 250;
  rerender();
  expect(base.scrollContainerRef.current.scrollTop).toBe(250);
  expect(result.current.props.zoom).toBe(100);
});
it('reopens a remembered free view using the original zoom controls', async () => {
  vi.mocked(loadPdfReadingView).mockResolvedValue({ mode: 'free', automatic, manual: automatic });
  const props = makeProps();
  const { result } = renderHook(() => usePdfHeightFitView(props, false), { wrapper: Wrapper });
  await act(async () => {});
  expect(result.current.props.zoom).toBe(200);
  result.current.props.onZoomIn();
  expect(props.onZoomIn).toHaveBeenCalledOnce();
  expect(savePdfReadingView).not.toHaveBeenCalled();
});

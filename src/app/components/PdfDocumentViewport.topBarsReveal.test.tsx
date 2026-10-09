import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, expect, it, vi } from 'vitest';

import { useRegisterPdfTopBars } from '../../features/pdf/components/PdfTopBarsContext';
import { DisplayScaleProvider } from '../../features/settings/context/DisplayScaleProvider';
import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentPanelScaleSurface } from './DocumentPanelScaleSurface';
import { ToolbarVisibilityHarness, setScrollTopAndScroll } from './PdfDocumentViewport.toolbarVisibility.testSupport';
import { WorkspacePdfTopBars } from './WorkspacePdfTopBars';

vi.mock('../../shared/platform/windowControls', () => ({
  setMainWindowNativeControlsVisible: vi.fn().mockResolvedValue(undefined)
}));

function ActivePdf() {
  const register = useRegisterPdfTopBars();
  useEffect(() => register?.({ id: 'pdf-one', enabled: true }), [register]);
  return <DisplayScaleProvider><DocumentPanelScaleSurface isPdfSurface panelKind="document" overlay={null} chrome={<button>Document navigation</button>}>
    <ToolbarVisibilityHarness />
  </DocumentPanelScaleSurface></DisplayScaleProvider>;
}

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  cleanup();
  vi.useRealTimers();
});

it('dismisses the floating bars immediately on a page click and allows margin reveal again', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  const toolbar = screen.getByTestId('pdf-document-toolbar');
  const navigation = screen.getByTestId('pdf-document-top-bar');
  const frame = screen.getAllByTestId('pdf-document-page-frame')[0]!;
  vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 0, 600, 1000));
  const edge = screen.getByTestId('pdf-top-bars-reveal-zone');
  fireEvent.mouseMove(edge, { clientX: 100, clientY: 500 });
  fireEvent.mouseMove(edge, { clientX: 500, clientY: 500 });
  fireEvent.click(frame);
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  expect(navigation).toHaveAttribute('data-visible', 'false');
  fireEvent.click(frame);
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  fireEvent.mouseMove(edge, { clientX: 100, clientY: 500 });
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
});

it('keeps a drag or excerpt gesture from dismissing the floating bars', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  const frame = screen.getAllByTestId('pdf-document-page-frame')[0]!;
  fireEvent.mouseDown(frame, { clientX: 200, clientY: 200 });
  fireEvent.mouseMove(frame, { clientX: 250, clientY: 200, buttons: 1 });
  fireEvent.click(frame, { clientX: 250, clientY: 200 });
  expect(screen.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'true');
  fireEvent.click(frame, { altKey: true });
  expect(screen.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Region excerpt' }));
  fireEvent.click(frame);
  expect(screen.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'true');
});

it('dismisses during a persistent search without clearing the query or consuming a link click', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  const input = screen.getByLabelText('PDF search');
  fireEvent.change(input, { target: { value: 'keyword' } });
  const link = document.createElement('a');
  link.textContent = 'PDF link';
  const activated = vi.fn();
  link.addEventListener('click', activated);
  screen.getAllByTestId('pdf-document-page-frame')[0]!.append(link);
  fireEvent.click(link);
  expect(activated).toHaveBeenCalledOnce();
  expect(input).toHaveValue('keyword');
  expect(screen.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'false');
});

it('leaves text selections and crop controls visible', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  const frame = screen.getAllByTestId('pdf-document-page-frame')[0]!;
  const crop = document.createElement('div');
  crop.dataset.pdfViewRangeSelection = 'true';
  frame.append(crop);
  fireEvent.click(crop);
  expect(screen.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'true');
  const range = document.createRange();
  range.selectNodeContents(frame.querySelector('.textLayer span')!);
  window.getSelection()?.addRange(range);
  fireEvent.click(frame);
  expect(screen.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'true');
});

it('reveals and protects the PDF toolbar from the side whitespace, then resumes idle hiding', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  vi.useFakeTimers();
  const toolbar = screen.getByTestId('pdf-document-toolbar');
  fireEvent.click(screen.getAllByTestId('pdf-document-page-frame')[0]!);
  setScrollTopAndScroll(screen.getByTestId('pdf-scroll-container'), 300);
  setScrollTopAndScroll(screen.getByTestId('pdf-scroll-container'), 360);
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  expect(screen.getByTestId('pdf-document-top-bar')).toHaveAttribute('data-visible', 'false');
  const edge = screen.getByTestId('pdf-top-bars-reveal-zone');
  vi.spyOn(screen.getAllByTestId('pdf-document-page-frame')[0]!, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 0, 600, 1000));
  fireEvent.mouseMove(edge, { clientX: 100, clientY: 500 });
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  act(() => vi.advanceTimersByTime(5000));
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  fireEvent.mouseLeave(edge);
  act(() => vi.advanceTimersByTime(3000));
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  expect(screen.getByTestId('pdf-document-top-bar')).toHaveAttribute('data-visible', 'false');
});

it('keeps margin interaction inside the document surface', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  expect(screen.getByRole('region', { name: 'Document panel' })).toContainElement(screen.getByTestId('pdf-top-bars-reveal-zone'));
});

it('reveals only the PDF toolbar when scrolling upward', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  vi.useFakeTimers();
  fireEvent.click(screen.getAllByTestId('pdf-document-page-frame')[0]!);
  const scroll = screen.getByTestId('pdf-scroll-container');
  setScrollTopAndScroll(scroll, 300);
  setScrollTopAndScroll(scroll, 360);
  setScrollTopAndScroll(scroll, 320);
  expect(screen.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'true');
  expect(screen.getByTestId('pdf-document-top-bar')).toHaveAttribute('data-visible', 'false');
  fireEvent.mouseEnter(screen.getByLabelText('Set zoom level').parentElement!);
  expect(screen.getByTestId('pdf-document-top-bar')).toHaveAttribute('data-visible', 'false');
});

it('reveals from both upper sides even when the PDF fills the whole viewport', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  vi.useFakeTimers();
  const edge = screen.getByTestId('pdf-top-bars-reveal-zone');
  const toolbar = screen.getByTestId('pdf-document-toolbar');
  const panel = toolbar.lastElementChild!;
  fireEvent.click(screen.getAllByTestId('pdf-document-page-frame')[0]!);
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue(new DOMRect(150, 76, 700, 40));
  vi.spyOn(toolbar, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 64, 1000, 0));
  Object.defineProperty(panel, 'offsetTop', { configurable: true, value: 12 });
  Object.defineProperty(panel, 'offsetHeight', { configurable: true, value: 40 });
  vi.spyOn(screen.getAllByTestId('pdf-document-page-frame')[0]!, 'getBoundingClientRect').mockReturnValue(new DOMRect(-100, 0, 1200, 1000));
  for (const clientX of [100, 900]) for (const clientY of [10, 45, 100]) {
    fireEvent.mouseLeave(edge);
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.getByTestId('pdf-document-top-bar')).toHaveAttribute('data-visible', 'false');
    fireEvent.mouseMove(edge, { clientX, clientY });
    expect(screen.getByTestId('pdf-document-top-bar')).toHaveAttribute('data-visible', 'true');
  }
});

it('keeps all bars visible while crossing the gap and operating the PDF toolbar', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  vi.useFakeTimers();
  const navigation = screen.getByTestId('pdf-document-top-bar');
  const toolbar = screen.getByTestId('pdf-document-toolbar');
  fireEvent.mouseEnter(navigation);
  act(() => vi.advanceTimersByTime(5000));
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  fireEvent.mouseLeave(navigation);
  fireEvent.mouseEnter(screen.getByTestId('pdf-toolbar-transfer-zone'));
  act(() => vi.advanceTimersByTime(1000));
  expect(navigation).toHaveAttribute('data-visible', 'true');
  fireEvent.mouseLeave(screen.getByTestId('pdf-toolbar-transfer-zone'));
  fireEvent.focus(screen.getByLabelText('PDF page'));
  act(() => vi.advanceTimersByTime(5000));
  expect(navigation).toHaveAttribute('data-visible', 'true');
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
});

it('keeps PDF search protected without revealing the upper bars', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  vi.useFakeTimers();
  const navigation = screen.getByTestId('pdf-document-top-bar');
  setScrollTopAndScroll(screen.getByTestId('pdf-scroll-container'), 300);
  fireEvent.click(screen.getByLabelText('Set zoom level'));
  act(() => vi.advanceTimersByTime(5000));
  expect(navigation).toHaveAttribute('data-visible', 'true');
  fireEvent.pointerDown(document.body);
  act(() => vi.advanceTimersByTime(3000));
  expect(navigation).toHaveAttribute('data-visible', 'false');
  const search = screen.getByLabelText('PDF search');
  fireEvent.focus(search);
  fireEvent.change(search, { target: { value: 'keyword' } });
  fireEvent.blur(search);
  act(() => vi.advanceTimersByTime(5000));
  expect(navigation).toHaveAttribute('data-visible', 'false');
  expect(screen.getByTestId('pdf-document-toolbar')).toHaveAttribute('data-toolbar-visible', 'true');
  fireEvent.change(search, { target: { value: '' } });
  act(() => vi.advanceTimersByTime(3000));
  expect(navigation).toHaveAttribute('data-visible', 'false');
});

it('reveals from the full side whitespace while leaving top text and dragging untouched', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  vi.useFakeTimers();
  const page = screen.getAllByTestId('pdf-document-page-shell')[0]!;
  vi.spyOn(page, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1000, 1000));
  vi.spyOn(screen.getAllByTestId('pdf-document-page-frame')[0]!, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 0, 600, 1000));
  const toolbar = screen.getByTestId('pdf-document-toolbar');
  setScrollTopAndScroll(screen.getByTestId('pdf-scroll-container'), 300);
  setScrollTopAndScroll(screen.getByTestId('pdf-scroll-container'), 360);
  fireEvent.mouseMove(screen.getByTestId('pdf-top-bars-reveal-zone'), { clientX: 500, clientY: 1 });
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  fireEvent.mouseMove(screen.getByTestId('pdf-top-bars-reveal-zone'), { clientX: 100, clientY: 700, buttons: 1 });
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  fireEvent.mouseMove(screen.getByTestId('pdf-top-bars-reveal-zone'), { clientX: 100, clientY: 700 });
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  fireEvent.mouseMove(screen.getByTestId('pdf-top-bars-reveal-zone'), { clientX: 500, clientY: 700 });
  act(() => vi.advanceTimersByTime(3000));
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  fireEvent.mouseMove(screen.getByTestId('pdf-top-bars-reveal-zone'), { clientX: 900, clientY: 400 });
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
});

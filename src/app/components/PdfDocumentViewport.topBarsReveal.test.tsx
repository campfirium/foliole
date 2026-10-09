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
  cleanup();
  vi.useRealTimers();
});

it('reveals and protects the PDF toolbar from the side whitespace, then resumes idle hiding', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  vi.useFakeTimers();
  const toolbar = screen.getByTestId('pdf-document-toolbar');
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

it('links the upper bars to PDF menu and persistent search protection', async () => {
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
  expect(navigation).toHaveAttribute('data-visible', 'true');
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

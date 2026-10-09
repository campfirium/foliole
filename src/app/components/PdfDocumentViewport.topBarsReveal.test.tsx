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

it('reveals and protects the PDF toolbar from the shared window edge, then resumes idle hiding', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  vi.useFakeTimers();
  const toolbar = screen.getByTestId('pdf-document-toolbar');
  setScrollTopAndScroll(screen.getByTestId('pdf-scroll-container'), 300);
  setScrollTopAndScroll(screen.getByTestId('pdf-scroll-container'), 360);
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
  const edge = screen.getByTestId('pdf-top-bars-reveal-zone');
  fireEvent.mouseEnter(edge);
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  act(() => vi.advanceTimersByTime(5000));
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'true');
  fireEvent.mouseLeave(edge);
  act(() => vi.advanceTimersByTime(3000));
  expect(toolbar).toHaveAttribute('data-toolbar-visible', 'false');
});

it('keeps the shared reveal edge inside the document surface', async () => {
  renderWithLocalization(<WorkspacePdfTopBars isImmersiveMode={false}><ActivePdf /></WorkspacePdfTopBars>);
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
  expect(screen.getByRole('region', { name: 'Document panel' })).toContainElement(screen.getByTestId('pdf-top-bars-reveal-zone'));
});

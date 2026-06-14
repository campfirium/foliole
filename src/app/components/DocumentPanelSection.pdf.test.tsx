import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';
import {
  createPdfSourceDetails,
  defaultImportSource,
  renderSection
} from './DocumentPanelSection.pdf.testSupport';
const appearanceMocks = vi.hoisted(() => ({
  setDimImagesInDarkMode: vi.fn()
}));
vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    dimImagesInDarkMode: false,
    editorDisplayMode: 'preview' as const,
    setDimImagesInDarkMode: appearanceMocks.setDimImagesInDarkMode,
    toggleEditorDisplayMode: vi.fn()
  })
}));
vi.mock('./DocumentPanelBody', () => ({
  DocumentPanelBody: () => <div data-testid="document-panel-body">Document body</div>
}));
vi.mock('./ReadwiseBookActionsPanel', () => ({
  ReadwiseBookActionsPanel: () => null
}));
vi.mock('./useNodeSourceUpdatePreview', () => ({
  useNodeSourceUpdatePreview: () => ({
    isLoading: false,
    value: null
  })
}));
const { useNodeSourceDetails } = vi.hoisted(() => ({ useNodeSourceDetails: vi.fn() }));
vi.mock('./useNodeSourceDetails', () => ({
  useNodeSourceDetails
}));

const RELEASE_GATE_TEST_TIMEOUT_MS = 15_000;
const RELEASE_GATE_WAIT_OPTIONS = { timeout: RELEASE_GATE_TEST_TIMEOUT_MS };

beforeEach(() => {
  appearanceMocks.setDimImagesInDarkMode.mockReset();
  useNodeSourceDetails.mockReturnValue({
    isLoading: false,
    value: null
  } as never);
});

it('keeps the existing document body for non-pdf nodes', () => {
  useNodeSourceDetails.mockReturnValue({
    isLoading: false,
    value: {
      importRuns: [],
      importSource: {
        ...defaultImportSource,
        sourceKind: 'markdown',
        sourceLocator: '/tmp/sample.md',
        sourceName: 'sample.md'
      },
      inheritedFromParent: false,
      keepImportItem: null,
      pdfPageDimensions: [],
      sourceNodeId: 'node-1'
    }
  } as never);

  renderSection();

  expect(screen.getByTestId('document-panel-body')).toBeInTheDocument();
  expect(screen.queryByTestId('pdf-document-surface')).not.toBeInTheDocument();
});

it('keeps document body for derived highlight nodes that inherit pdf source from parent', () => {
  useNodeSourceDetails.mockReturnValue({
    isLoading: false,
    value: {
      importRuns: [],
      importSource: defaultImportSource,
      inheritedFromParent: true,
      keepImportItem: null,
      pdfPageDimensions: [],
      sourceNodeId: 'node-parent'
    }
  } as never);

  renderSection();

  expect(screen.getByTestId('document-panel-body')).toBeInTheDocument();
  expect(screen.queryByTestId('pdf-document-surface')).not.toBeInTheDocument();
});

it('renders the pdf reading container for linked pdf nodes', async () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  renderSection();

  expect(await screen.findByTestId('pdf-document-surface', undefined, RELEASE_GATE_WAIT_OPTIONS)).toBeInTheDocument();
  expect(await screen.findByTestId('pdf-document-view', undefined, RELEASE_GATE_WAIT_OPTIONS)).toHaveAttribute('data-file', 'file:///tmp/sample.pdf');
}, RELEASE_GATE_TEST_TIMEOUT_MS);

it('passes app protocol pdf attachments through to the document loader', async () => {
  useNodeSourceDetails.mockReturnValue(
    createPdfSourceDetails({
      importSource: {
        ...defaultImportSource,
        sourceLocator: 'foliole-asset://attachment/hash-1'
      }
    }) as never
  );

  renderSection();

  expect(await screen.findByTestId('pdf-document-view')).toHaveAttribute('data-file', 'foliole-asset://attachment/hash-1');
});

it('renders the pdf toolbar and nearby pages after the document connects', async () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  renderSection();

  await waitFor(() => expect(screen.getByTestId('pdf-document-toolbar')).toBeInTheDocument());
  expect(screen.getAllByTestId('pdf-document-page')).toHaveLength(3);
  expect(screen.queryByText(/highlight/i)).not.toBeInTheDocument();
  expect(screen.queryByTestId('document-panel-body')).not.toBeInTheDocument();
});

it('hides the interim pdf loading states behind a single loading overlay', async () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  renderSection();

  expect(screen.queryByText('Preparing PDF...')).not.toBeInTheDocument();
  await waitFor(() => expect(screen.queryByTestId('pdf-document-loading-overlay')).not.toBeInTheDocument());
});

it('hides the raw pdf source path while source details are still loading', () => {
  useNodeSourceDetails.mockReturnValue({ isLoading: true, value: null } as never);

  renderSection({ editorContent: '/tmp/sample.pdf' });

  expect(screen.getByTestId('pdf-document-loading-shell')).toBeInTheDocument();
  expect(screen.queryByTestId('document-panel-body')).not.toBeInTheDocument();
  expect(screen.queryByText('/tmp/sample.pdf')).not.toBeInTheDocument();
});

it('clears the editor binding when switching into pdf view', () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);
  const onEditorReady = vi.fn();

  renderSection({ onEditorReady });

  expect(onEditorReady).toHaveBeenCalledWith(null);
});

it('supports pdf controls with zoom, page navigation, and rotation after the reader loads', async () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  renderSection();

  await waitFor(() => expect(screen.getByTestId('pdf-zoom-value')).toHaveTextContent('100%'));
  expect(screen.getByTestId('pdf-zoom-value')).toHaveTextContent('100%');

  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  expect(screen.getByTestId('pdf-zoom-value')).toHaveTextContent('110%');

  fireEvent.change(screen.getByRole('textbox', { name: 'PDF page' }), {
    target: { value: '5' }
  });
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'PDF page' }), { key: 'Enter' });
  expect(screen.getByRole('textbox', { name: 'PDF page' })).toHaveValue('5');

  fireEvent.click(screen.getByRole('button', { name: 'Rotate page clockwise' }));
  expect(screen.getAllByTestId('pdf-document-page')[0]).toHaveAttribute('data-rotate', '90');
});
it('lets the reader return to fit width with the toolbar button after the reader loads', async () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  renderSection();

  await waitFor(() => expect(screen.getByRole('button', { name: 'Set zoom level' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Set zoom level' }));
  fireEvent.click(screen.getByRole('menuitem', { name: '100%' }));
  expect(screen.getByTestId('pdf-zoom-value')).toHaveTextContent('100%');

  fireEvent.click(screen.getByRole('button', { name: 'Fit width' }));
  expect(screen.getByTestId('pdf-zoom-value')).toHaveTextContent('100%');
});

it('keeps the PDF appearance control out of the toolbar', async () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  renderSection();

  await waitFor(() => expect(screen.getByRole('button', { name: 'Set zoom level' })).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: 'Set PDF reading mode' })).toBeNull();
});

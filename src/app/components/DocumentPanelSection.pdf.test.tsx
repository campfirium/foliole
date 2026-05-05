import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';
import { DocumentPanelSection } from './DocumentPanelSection';
const appearanceMocks = vi.hoisted(() => ({
  setDimImagesInDarkMode: vi.fn(),
  setPdfReadingMode: vi.fn()
}));
vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    dimImagesInDarkMode: false,
    editorDisplayMode: 'preview' as const,
    pdfReadingMode: 'inverted' as const,
    setDimImagesInDarkMode: appearanceMocks.setDimImagesInDarkMode,
    setPdfReadingMode: appearanceMocks.setPdfReadingMode,
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
const baseNode = {
  id: 'node-1',
  kind: 'topic' as const,
  title: 'Node 1',
  parentNodeId: null,
  content: '',
  anchorLink: null,
  reveal: '',
  review: null,
  createdAt: '',
  updatedAt: ''
};
const defaultImportSource = {
  firstImportedAt: '2026-04-04T14:00:00.000Z',
  lastContentFingerprint: 'fingerprint-1',
  lastImportedAt: '2026-04-04T14:00:00.000Z',
  latestNodeId: 'node-1',
  provider: 'desktop_text_file',
  sourceFingerprint: 'source-1',
  sourceKind: 'pdf',
  sourceLocator: '/tmp/sample.pdf',
  sourceName: 'sample.pdf'
};
const defaultProps: ComponentProps<typeof DocumentPanelSection> = {
  activeNodeId: 'node-1',
  canGoBack: true,
  canGoForward: true,
  canGoParent: false,
  contextMenu: null,
  documentMaxWidth: 760,
  editableNodeId: 'node-1',
  editorAppearanceKey: 'appearance-1',
  editorContent: '# Node 1',
  isEditorReadOnly: false,
  editorNodeId: 'node-1',
  editorNodeViewState: undefined,
  isDocumentResizing: false,
  nodeOrder: ['node-1'],
  trashedNodeIds: [],
  nodesById: { 'node-1': baseNode },
  onAnswerChange: () => undefined,
  onCloseContextMenu: () => undefined,
  onCopyImage: () => undefined,
  onCreateCloze: () => undefined,
  onCreateHighlight: () => undefined,
  onCreatePdfHighlight: () => false,
  onCutImage: () => undefined,
  onDeleteImage: () => undefined,
  onEditorChange: () => undefined,
  onNodeContentChange: () => undefined,
  onEditorContextMenu: () => undefined,
  onEditorReady: () => undefined,
  onExportImage: () => undefined,
  onGoBack: () => undefined,
  onGoForward: () => undefined,
  onGoParent: () => undefined,
  onPersistPdfViewState: () => undefined,
  onResetLayout: () => undefined,
  onResolveDocumentPositionAtViewportY: () => null,
  onRevealDocumentPosition: () => undefined,
  onRevealDocumentSelection: () => undefined,
  onSelectBreadcrumbNode: () => undefined,
  onSelectNode: () => undefined,
  onStartDocumentResize: () => undefined,
  showAnswerSection: false
};
function renderSection(overrides: Partial<ComponentProps<typeof DocumentPanelSection>> = {}) {
  return render(<DocumentPanelSection {...defaultProps} {...overrides} />);
}
function createPdfSourceDetails(overrides?: {
  importSource?: Record<string, unknown> | null;
  isLoading?: boolean;
  keepImportItem?: Record<string, unknown> | null;
}) {
  return {
    isLoading: overrides?.isLoading ?? false,
    value: {
      importRuns: [],
      importSource: overrides?.importSource === undefined ? defaultImportSource : overrides.importSource,
      inheritedFromParent: false,
      keepImportItem: overrides?.keepImportItem ?? null,
      pdfPageDimensions: [],
      sourceNodeId: 'node-1'
    }
  };
}
beforeEach(() => {
  appearanceMocks.setDimImagesInDarkMode.mockReset();
  appearanceMocks.setPdfReadingMode.mockReset();
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

it('renders the pdf reading container for linked pdf nodes', () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  renderSection();

  expect(screen.getByTestId('pdf-document-surface')).toBeInTheDocument();
  expect(screen.getByTestId('pdf-document-view')).toHaveAttribute('data-file', 'file:///tmp/sample.pdf');
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

  expect(screen.queryByText('Loading PDF...')).not.toBeInTheDocument();
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

it('shows the PDF reading mode control in the toolbar', async () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  renderSection();

  await waitFor(() => expect(screen.getByRole('button', { name: 'Set PDF reading mode' })).toBeInTheDocument());
});

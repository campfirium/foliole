import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';
import { DocumentPanelSection } from './DocumentPanelSection';

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    editorDisplayMode: 'preview' as const,
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
      sourceNodeId: 'node-1'
    }
  };
}

beforeEach(() => {
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
  expect(screen.getByTestId('pdf-document-toolbar')).toBeInTheDocument();
  expect(screen.queryByText(/highlight/i)).not.toBeInTheDocument();
  expect(screen.queryByTestId('document-panel-body')).not.toBeInTheDocument();
});

it('supports pdf controls with zoom, page navigation, and rotation', () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  renderSection();

  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  expect(screen.getByTestId('pdf-zoom-value')).toHaveTextContent('110%');

  fireEvent.change(screen.getByRole('spinbutton', { name: 'PDF page' }), {
    target: { value: '5' }
  });
  expect(screen.getByRole('spinbutton', { name: 'PDF page' })).toHaveValue(5);

  fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
  expect(screen.getByRole('spinbutton', { name: 'PDF page' })).toHaveValue(4);

  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByRole('spinbutton', { name: 'PDF page' })).toHaveValue(5);

  fireEvent.click(screen.getByRole('button', { name: 'Rotate page clockwise' }));
  expect(screen.getAllByTestId('pdf-document-page')[0]).toHaveAttribute('data-rotate', '90');
});
it('supports in-view pdf search navigation and empty-state feedback', async () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  renderSection();

  const previousMatchButton = screen.getByRole('button', { name: 'Previous match' });
  const nextMatchButton = screen.getByRole('button', { name: 'Next match' });
  expect(previousMatchButton).toBeDisabled();
  expect(nextMatchButton).toBeDisabled();

  const searchInput = screen.getByRole('textbox', { name: 'PDF search' });
  fireEvent.change(searchInput, { target: { value: 'keyword' } });
  await waitFor(() => {
    expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('1 / 9');
    expect(previousMatchButton).toBeEnabled();
    expect(nextMatchButton).toBeEnabled();
  });

  fireEvent.click(nextMatchButton);
  await waitFor(() => expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('2 / 9'));

  fireEvent.change(searchInput, { target: { value: 'not-found-token' } });
  await waitFor(() => {
    expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('No matches');
    expect(previousMatchButton).toBeDisabled();
    expect(nextMatchButton).toBeDisabled();
  });
});

it('supports Enter and Shift+Enter for in-view pdf search navigation', async () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  renderSection();

  const searchInput = screen.getByRole('textbox', { name: 'PDF search' });
  fireEvent.change(searchInput, { target: { value: 'keyword' } });
  await waitFor(() => expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('1 / 9'));

  fireEvent.keyDown(searchInput, { key: 'Enter' });
  await waitFor(() => expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('2 / 9'));

  fireEvent.keyDown(searchInput, { key: 'Enter', shiftKey: true });
  await waitFor(() => expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('1 / 9'));
});
it('keeps the pdf reading container visible while a linked pdf node source is refreshing', () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails({ isLoading: true }) as never);

  renderSection();

  expect(screen.getByTestId('pdf-document-surface')).toBeInTheDocument();
  expect(screen.queryByTestId('pdf-document-state-loading')).not.toBeInTheDocument();
});

it.each([
  {
    expectedTestId: 'pdf-document-state-failed',
    expectedTitle: 'PDF reader failed',
    sourceDetails: createPdfSourceDetails({
      keepImportItem: {
        firstSeenAt: '2026-04-04T14:00:00.000Z',
        hasSourceUpdate: false,
        highlightPath: null,
        keepState: 'enabled',
        lastImportedAt: '2026-04-04T14:00:00.000Z',
        lastSeenAt: '2026-04-04T14:00:00.000Z',
        lastStatus: 'failed',
        primaryPath: '/tmp',
        resolvedSourcePath: '/tmp/sample.pdf',
        ruleId: 'rule-1',
        ruleLabel: 'Keep import source',
        sourceMtimeMs: 1,
        sourcePath: 'sample.pdf',
        sourceSizeBytes: 1024,
        sourceType: 'generic'
      }
    })
  },
  {
    expectedTestId: 'pdf-document-state-empty',
    expectedTitle: 'PDF file not linked yet',
    sourceDetails: createPdfSourceDetails({
      importSource: {
        ...defaultImportSource,
        sourceKind: 'pdf',
        sourceLocator: '',
        sourceName: 'sample.pdf'
      }
    })
  }
])('renders the expected non-ready pdf state: $expectedTestId', ({ expectedTestId, expectedTitle, sourceDetails }) => {
  useNodeSourceDetails.mockReturnValue(sourceDetails as never);

  renderSection();

  expect(screen.getByTestId(expectedTestId)).toBeInTheDocument();
  expect(screen.getByText(expectedTitle)).toBeInTheDocument();
});

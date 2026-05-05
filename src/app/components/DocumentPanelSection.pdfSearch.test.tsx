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
vi.mock('./useNodeSourceDetails', () => ({ useNodeSourceDetails }));

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
  nodesById: {
    'node-1': { anchorLink: null, content: '', createdAt: '', id: 'node-1', kind: 'topic', parentNodeId: null, reveal: '', review: null, title: 'Node 1', updatedAt: '' }
  },
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

function createPdfSourceDetails() {
  return {
    isLoading: false,
    value: {
      importRuns: [],
      importSource: {
        firstImportedAt: '2026-04-04T14:00:00.000Z',
        lastContentFingerprint: 'fingerprint-1',
        lastImportedAt: '2026-04-04T14:00:00.000Z',
        latestNodeId: 'node-1',
        provider: 'desktop_text_file',
        sourceFingerprint: 'source-1',
        sourceKind: 'pdf',
        sourceLocator: '/tmp/sample.pdf',
        sourceName: 'sample.pdf'
      },
      inheritedFromParent: false,
      keepImportItem: null,
      pdfPageDimensions: [],
      sourceNodeId: 'node-1'
    }
  };
}

beforeEach(() => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);
});

it('supports in-view pdf search navigation and empty-state feedback', async () => {
  render(<DocumentPanelSection {...defaultProps} />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'PDF search' })).toBeInTheDocument());
  const previousMatchButton = screen.getByRole('button', { name: 'Previous match' });
  const nextMatchButton = screen.getByRole('button', { name: 'Next match' });
  const searchInput = screen.getByRole('textbox', { name: 'PDF search' });
  const clearSearchButton = screen.getByRole('button', { name: 'Clear search' });
  expect(previousMatchButton).toBeDisabled();
  expect(nextMatchButton).toBeDisabled();
  expect(clearSearchButton).toBeDisabled();
  fireEvent.change(searchInput, { target: { value: 'keyword' } });
  await waitFor(() => {
    expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('1 / 9');
    expect(previousMatchButton).toBeEnabled();
    expect(nextMatchButton).toBeEnabled();
    expect(clearSearchButton).toBeEnabled();
    expect(screen.queryByText('Search debug')).not.toBeInTheDocument();
  });
  fireEvent.click(nextMatchButton);
  await waitFor(() => expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('2 / 9'));
  fireEvent.click(clearSearchButton);
  await waitFor(() => {
    expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('');
    expect(searchInput).toHaveValue('');
    expect(previousMatchButton).toBeDisabled();
    expect(nextMatchButton).toBeDisabled();
    expect(clearSearchButton).toBeDisabled();
  });
  fireEvent.change(searchInput, { target: { value: 'not-found-token' } });
  await waitFor(() => {
    expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('No matches');
    expect(previousMatchButton).toBeDisabled();
    expect(nextMatchButton).toBeDisabled();
  });
});

it('supports Enter and Shift+Enter for in-view pdf search navigation', async () => {
  render(<DocumentPanelSection {...defaultProps} />);
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'PDF search' })).toBeInTheDocument());
  const searchInput = screen.getByRole('textbox', { name: 'PDF search' });
  fireEvent.change(searchInput, { target: { value: 'keyword' } });
  await waitFor(() => expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('1 / 9'));
  fireEvent.keyDown(searchInput, { key: 'Enter' });
  await waitFor(() => expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('2 / 9'));
  fireEvent.keyDown(searchInput, { key: 'Enter', shiftKey: true });
  await waitFor(() => expect(screen.getByTestId('pdf-search-status')).toHaveTextContent('1 / 9'));
});

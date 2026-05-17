import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';
import { DocumentPanelSection } from './DocumentPanelSection';

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({ editorDisplayMode: 'preview' as const, toggleEditorDisplayMode: vi.fn() })
}));
vi.mock('./DocumentPanelBody', () => ({ DocumentPanelBody: () => <div data-testid="document-panel-body">Document body</div> }));
vi.mock('./ReadwiseBookActionsPanel', () => ({ ReadwiseBookActionsPanel: () => null }));
vi.mock('./useNodeSourceUpdatePreview', () => ({ useNodeSourceUpdatePreview: () => ({ isLoading: false, value: null }) }));

const { useNodeSourceDetails } = vi.hoisted(() => ({ useNodeSourceDetails: vi.fn() }));
vi.mock('./useNodeSourceDetails', () => ({ useNodeSourceDetails }));

const defaultProps: ComponentProps<typeof DocumentPanelSection> = {
  activeNodeId: 'node-1',
  canGoBack: true,
  canGoForward: true,
  canGoParent: false,
  contextMenu: null,
  editableNodeId: 'node-1',
  editorAppearanceKey: 'appearance-1',
  editorContent: '# Node 1',
  editorNodeId: 'node-1',
  isEditorReadOnly: false,
  nodeOrder: ['node-1'],
  nodesById: { 'node-1': { anchorLink: null, content: '', createdAt: '', id: 'node-1', kind: 'topic', parentNodeId: null, reveal: '', review: null, title: 'Node 1', updatedAt: '' } },
  onAnswerChange: () => undefined,
  onCloseContextMenu: () => undefined,
  onCopyImage: () => undefined,
  onCreateCloze: () => undefined,
  onCreateHighlight: () => undefined,
  onCreatePdfHighlight: () => false,
  onAdjustExistingHighlightRange: () => true,
  onCutImage: () => undefined,
  onDeleteImage: () => undefined,
  onEditorChange: () => undefined,
  onEditorContextMenu: () => undefined,
  onEditorReady: () => undefined,
  onExportImage: () => undefined,
  onGoBack: () => undefined,
  onGoForward: () => undefined,
  onGoParent: () => undefined,
  onNodeContentChange: () => undefined,
  onPersistPdfViewState: () => undefined,
  onResolveDocumentPositionAtViewportY: () => null,
  onRevealDocumentPosition: () => undefined,
  onRevealDocumentSelection: () => undefined,
  onSelectBreadcrumbNode: () => undefined,
  onSelectNode: () => undefined,
  showAnswerSection: false,
  trashedNodeIds: []
};

function createPdfSourceDetails(overrides?: { isLoading?: boolean }) {
  return {
    isLoading: overrides?.isLoading ?? false,
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

it('keeps the visible page number stable until the next-page scroll actually settles', async () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  render(<DocumentPanelSection {...defaultProps} />);

  await waitFor(() => {
    expect(screen.getByTestId('pdf-document-toolbar')).toBeInTheDocument();
  });
  expect(screen.getByRole('textbox', { name: 'PDF page' })).toHaveValue('1');
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByRole('textbox', { name: 'PDF page' })).toHaveValue('2');
});

it('keeps the pdf reading container visible while a linked pdf node source is refreshing', async () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails({ isLoading: true }) as never);

  render(<DocumentPanelSection {...defaultProps} />);

  await waitFor(() => {
    expect(screen.getAllByTestId('pdf-document-page-shell')).toHaveLength(9);
  });
  expect(screen.getByTestId('pdf-document-surface')).toBeInTheDocument();
  expect(screen.queryByTestId('pdf-document-state-loading')).not.toBeInTheDocument();
});

it('reserves shells for every pdf page while only rendering the nearby canvases', async () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  render(<DocumentPanelSection {...defaultProps} />);

  await waitFor(() => {
    expect(screen.getAllByTestId('pdf-document-page-shell')).toHaveLength(9);
  });
  expect(screen.getAllByTestId('pdf-document-page')).toHaveLength(3);
});

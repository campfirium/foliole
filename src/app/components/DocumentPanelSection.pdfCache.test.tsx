import { render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';

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

const { useNodeSourceDetails } = vi.hoisted(() => ({
  useNodeSourceDetails: vi.fn()
}));

vi.mock('./useNodeSourceDetails', () => ({
  useNodeSourceDetails
}));

const pdfNode = {
  id: 'node-1',
  kind: 'topic' as const,
  title: 'PDF Node',
  parentNodeId: null,
  content: '',
  anchorLink: null,
  reveal: '',
  review: null,
  createdAt: '',
  updatedAt: ''
};

const textNode = {
  ...pdfNode,
  id: 'node-2',
  title: 'Text Node'
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
  nodeOrder: ['node-1', 'node-2'],
  trashedNodeIds: [],
  nodesById: { 'node-1': pdfNode, 'node-2': textNode },
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

function createSourceDetails(sourceKind: 'pdf' | 'markdown', sourceLocator: string) {
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
        sourceKind,
        sourceLocator,
        sourceName: sourceKind === 'pdf' ? 'sample.pdf' : 'sample.md'
      },
      inheritedFromParent: false,
      keepImportItem: null,
      sourceNodeId: 'node-1'
    }
  };
}

it('keeps a cached pdf view visible when revisiting the same node during source refresh', async () => {
  const sourceDetailsByNodeId: Record<string, { isLoading: boolean; value: unknown | null }> = {
    'node-1': createSourceDetails('pdf', '/tmp/sample.pdf'),
    'node-2': createSourceDetails('markdown', '/tmp/sample.md')
  };

  useNodeSourceDetails.mockImplementation((nodeId: string | null) => {
    if (!nodeId) {
      return { isLoading: false, value: null };
    }
    return sourceDetailsByNodeId[nodeId] ?? { isLoading: false, value: null };
  });

  const rendered = render(<DocumentPanelSection {...defaultProps} />);
  expect(screen.getByTestId('pdf-document-surface')).toBeInTheDocument();

  rendered.rerender(<DocumentPanelSection {...defaultProps} activeNodeId="node-2" editorNodeId="node-2" />);
  expect(screen.getByTestId('document-panel-content-body')).toBeInTheDocument();

  sourceDetailsByNodeId['node-1'] = { isLoading: true, value: null };
  rendered.rerender(<DocumentPanelSection {...defaultProps} activeNodeId="node-1" editorNodeId="node-1" />);

  await waitFor(() => {
    expect(screen.getByTestId('pdf-document-surface')).toBeInTheDocument();
    expect(screen.queryByTestId('pdf-document-state-loading')).not.toBeInTheDocument();
  });
});

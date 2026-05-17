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

const { useNodeSourceDetails } = vi.hoisted(() => ({
  useNodeSourceDetails: vi.fn()
}));

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

function createDefaultProps(): ComponentProps<typeof DocumentPanelSection> {
  return {
    activeNodeId: 'node-1',
    canGoBack: true,
    canGoForward: true,
    canGoParent: false,
    contextMenu: null,
    editableNodeId: 'node-1',
    editorAppearanceKey: 'appearance-1',
    editorContent: '# Node 1',
    isEditorReadOnly: false,
    editorNodeId: 'node-1',
    nodeOrder: ['node-1'],
    trashedNodeIds: [],
    nodesById: { 'node-1': { ...baseNode } },
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
    onNodeContentChange: () => undefined,
    onEditorContextMenu: () => undefined,
    onEditorReady: () => undefined,
    onExportImage: () => undefined,
    onGoBack: () => undefined,
    onGoForward: () => undefined,
    onGoParent: () => undefined,
    onPersistPdfViewState: () => undefined,
    onResolveDocumentPositionAtViewportY: () => null,
    onRevealDocumentPosition: () => undefined,
    onRevealDocumentSelection: () => undefined,
    onSelectBreadcrumbNode: () => undefined,
    onSelectNode: () => undefined,
    showAnswerSection: false
  };
}

beforeEach(() => {
  useNodeSourceDetails.mockReturnValue({
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
  } as never);
});

it('writes pdf page and zoom through onPersistPdfViewState callback', async () => {
  const onPersistPdfViewState = vi.fn();

  render(<DocumentPanelSection {...createDefaultProps()} onPersistPdfViewState={onPersistPdfViewState} />);

  expect(onPersistPdfViewState).not.toHaveBeenCalled();

  await waitFor(() => expect(screen.getByRole('button', { name: 'Zoom in' })).toBeInTheDocument());
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));

  await waitFor(() =>
    expect(onPersistPdfViewState).toHaveBeenCalledWith('node-1', {
      scrollTop: 0,
      selection: { from: 1, to: 110 }
    })
  );
});

it('keeps fit width as the default persisted zoom mode for a new pdf', async () => {
  const onPersistPdfViewState = vi.fn();

  render(<DocumentPanelSection {...createDefaultProps()} onPersistPdfViewState={onPersistPdfViewState} />);

  await waitFor(() => expect(screen.getByRole('textbox', { name: 'PDF page' })).toBeInTheDocument());
  fireEvent.change(screen.getByRole('textbox', { name: 'PDF page' }), {
    target: { value: '2' }
  });
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'PDF page' }), { key: 'Enter' });

  await waitFor(() =>
    expect(onPersistPdfViewState).toHaveBeenCalledWith('node-1', {
      scrollTop: 0,
      selection: { from: 2, to: 0 }
    })
  );
});

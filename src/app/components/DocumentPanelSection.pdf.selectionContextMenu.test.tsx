import { act, fireEvent, render, screen } from '@testing-library/react';
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
      sourceNodeId: 'node-1'
    }
  } as never);
});

it('keeps selected pdf text available when right-click clears selection before context menu', () => {
  const onCreatePdfHighlight = vi.fn();

  render(<DocumentPanelSection {...defaultProps} onCreatePdfHighlight={onCreatePdfHighlight} />);

  const textNode = screen.getByText('keyword match on page 1');
  const range = document.createRange();
  range.selectNodeContents(textNode);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  act(() => {
    document.dispatchEvent(new Event('selectionchange'));
  });

  selection?.removeAllRanges();
  act(() => {
    fireEvent.contextMenu(textNode, { button: 2, clientX: 220, clientY: 180 });
  });

  expect(screen.getByTestId('pdf-selection-marker')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Highlight' }));
  expect(onCreatePdfHighlight).toHaveBeenCalledWith('keyword match on page 1', expect.anything());
});

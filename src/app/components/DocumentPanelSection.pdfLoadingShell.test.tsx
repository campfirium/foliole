import { render, screen } from '@testing-library/react';
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
  editorContent: '# sample\n\nLinked PDF source ready for the reader surface.',
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

it('hides the imported pdf placeholder while source details are still loading', () => {
  useNodeSourceDetails.mockReturnValue({ isLoading: true, value: null } as never);

  render(<DocumentPanelSection {...defaultProps} />);

  expect(screen.getByTestId('pdf-document-loading-shell')).toBeInTheDocument();
  expect(screen.queryByTestId('document-panel-body')).not.toBeInTheDocument();
  expect(screen.queryByText('Linked PDF source ready for the reader surface.')).not.toBeInTheDocument();
});

it('keeps markdown visible while source details load when frontmatter only mentions a pdf url', () => {
  useNodeSourceDetails.mockReturnValue({ isLoading: true, value: null } as never);

  render(
    <DocumentPanelSection
      {...defaultProps}
      editorContent={'---\nsource_url: https://example.com/sample.pdf\n---\n\n# Article title\n\nBody.'}
    />
  );

  expect(screen.queryByTestId('pdf-document-loading-shell')).not.toBeInTheDocument();
  expect(screen.getByTestId('document-panel-body')).toBeInTheDocument();
});

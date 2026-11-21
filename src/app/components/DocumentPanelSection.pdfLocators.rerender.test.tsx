import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';

import { renderWithLocalization as render } from '../../shared/localization/testLocalization';

import '../../test/reactPdfMock';
import { DocumentPanelSection } from './DocumentPanelSection';
import { collectPdfHighlightLocators } from './pdfHighlightLocators';

vi.mock('./pdfHighlightLocators', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./pdfHighlightLocators')>();
  return { ...actual, collectPdfHighlightLocators: vi.fn(actual.collectPdfHighlightLocators) };
});

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
  bodyStatus: 'ready' as const,
  hasContent: true,
  hasReveal: false,
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
  title: 'Text Node',
  content: '# Text node'
};

const defaultProps: ComponentProps<typeof DocumentPanelSection> = {
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
  nodeOrder: ['node-1', 'node-2'],
  trashedNodeIds: [],
  nodesById: { 'node-1': pdfNode, 'node-2': textNode },
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

const PDF_SOURCE_DETAILS = createSourceDetails('pdf', '/tmp/sample.pdf');

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
        pdfIndexStatus: sourceKind === 'pdf' ? 'ready' : null,
        sourceFingerprint: 'source-1',
        sourceKind,
        sourceLocator,
        sourceName: sourceKind === 'pdf' ? 'sample.pdf' : 'sample.md'
      },
      inheritedFromParent: false,
      keepImportItem: null,
      pdfPageDimensions: [],
      sourceNodeId: 'node-1'
    }
  };
}

it('collects PDF highlight locators once while the document inputs are unchanged', () => {
  useNodeSourceDetails.mockImplementation((nodeId: string | null) =>
    nodeId === 'node-1' ? PDF_SOURCE_DETAILS : { isLoading: false, value: null }
  );
  const rendered = render(<DocumentPanelSection {...defaultProps} />);
  const collectsAfterMount = vi.mocked(collectPdfHighlightLocators).mock.calls.length;
  expect(collectsAfterMount).toBeGreaterThan(0);
  // The host re-renders with fresh callbacks while the library and active PDF stay the same.
  for (let tick = 1; tick <= 5; tick += 1) {
    rendered.rerender(<DocumentPanelSection {...defaultProps} onSelectNode={() => tick} />);
  }
  expect(collectPdfHighlightLocators).toHaveBeenCalledTimes(collectsAfterMount);
});

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
  documentMaxWidth: 760,
  editableNodeId: 'node-1',
  editorAppearanceKey: 'appearance-1',
  editorContent: '# Node 1',
  editorNodeId: 'node-1',
  editorNodeViewState: undefined,
  isDocumentResizing: false,
  isEditorReadOnly: false,
  nodeOrder: ['node-1'],
  nodesById: { 'node-1': { anchorLink: null, content: '', createdAt: '', id: 'node-1', kind: 'topic', parentNodeId: null, reveal: '', review: null, title: 'Node 1', updatedAt: '' } },
  onAnswerChange: () => undefined,
  onCloseContextMenu: () => undefined,
  onCopyImage: () => undefined,
  onCreateCloze: () => undefined,
  onCreateHighlight: () => undefined,
  onCreatePdfHighlight: () => false,
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
  onResetLayout: () => undefined,
  onResolveDocumentPositionAtViewportY: () => null,
  onRevealDocumentPosition: () => undefined,
  onRevealDocumentSelection: () => undefined,
  onSelectBreadcrumbNode: () => undefined,
  onSelectNode: () => undefined,
  onStartDocumentResize: () => undefined,
  showAnswerSection: false,
  trashedNodeIds: []
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

function renderSection() {
  return render(<DocumentPanelSection {...defaultProps} />);
}

function createPdfSourceDetails(overrides?: { importSource?: Record<string, unknown> | null; keepImportItem?: Record<string, unknown> | null }) {
  return {
    isLoading: false,
    value: { importRuns: [], importSource: overrides?.importSource === undefined ? defaultImportSource : overrides.importSource, inheritedFromParent: false, keepImportItem: overrides?.keepImportItem ?? null, sourceNodeId: 'node-1' }
  };
}

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
      importSource: { ...defaultImportSource, sourceKind: 'pdf', sourceLocator: '', sourceName: 'sample.pdf' }
    })
  }
])('renders the expected non-ready pdf state: $expectedTestId', ({ expectedTestId, expectedTitle, sourceDetails }) => {
  useNodeSourceDetails.mockReturnValue(sourceDetails as never);
  renderSection();
  expect(screen.getByTestId(expectedTestId)).toBeInTheDocument();
  expect(screen.getByText(expectedTitle)).toBeInTheDocument();
});

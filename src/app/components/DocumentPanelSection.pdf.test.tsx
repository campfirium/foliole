import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

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
  nodesById: { 'node-1': baseNode },
  onAnswerChange: () => undefined,
  onCloseContextMenu: () => undefined,
  onCopyImage: () => undefined,
  onCreateCloze: () => undefined,
  onCreateHighlight: () => undefined,
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
  onResetLayout: () => undefined,
  onResolveDocumentPositionAtViewportY: () => null,
  onRevealDocumentPosition: () => undefined,
  onRevealDocumentSelection: () => undefined,
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
      importSource:
        overrides?.importSource === undefined
          ? {
              firstImportedAt: '2026-04-04T14:00:00.000Z',
              lastContentFingerprint: 'fingerprint-1',
              lastImportedAt: '2026-04-04T14:00:00.000Z',
              latestNodeId: 'node-1',
              provider: 'desktop_text_file',
              sourceFingerprint: 'source-1',
              sourceKind: 'pdf',
              sourceLocator: '/tmp/sample.pdf',
              sourceName: 'sample.pdf'
            }
          : overrides.importSource,
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
        firstImportedAt: '2026-04-04T14:00:00.000Z',
        lastContentFingerprint: 'fingerprint-1',
        lastImportedAt: '2026-04-04T14:00:00.000Z',
        latestNodeId: 'node-1',
        provider: 'desktop_text_file',
        sourceFingerprint: 'source-1',
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

it('renders the pdf reading container for linked pdf nodes', () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails() as never);

  renderSection();

  expect(screen.getByTestId('pdf-document-surface')).toBeInTheDocument();
  expect(screen.getByTestId('pdf-document-state-ready')).toBeInTheDocument();
  expect(screen.getByText('PDF reader*')).toBeInTheDocument();
  expect(screen.queryByTestId('document-panel-body')).not.toBeInTheDocument();
});

it('shows a loading state while a pdf node source is refreshing', () => {
  useNodeSourceDetails.mockReturnValue(createPdfSourceDetails({ isLoading: true }) as never);

  renderSection();

  expect(screen.getByTestId('pdf-document-state-loading')).toBeInTheDocument();
  expect(screen.getByText('Loading PDF reader*')).toBeInTheDocument();
});

it('shows a failed state when the linked pdf source is marked failed', () => {
  useNodeSourceDetails.mockReturnValue(
    createPdfSourceDetails({
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
    }) as never
  );

  renderSection();

  expect(screen.getByTestId('pdf-document-state-failed')).toBeInTheDocument();
  expect(screen.getByText('PDF reader failed')).toBeInTheDocument();
});

it('shows an empty state when a pdf node has no linked file yet', () => {
  useNodeSourceDetails.mockReturnValue(
    createPdfSourceDetails({
      importSource: {
        firstImportedAt: '2026-04-04T14:00:00.000Z',
        lastContentFingerprint: 'fingerprint-1',
        lastImportedAt: '2026-04-04T14:00:00.000Z',
        latestNodeId: 'node-1',
        provider: 'desktop_text_file',
        sourceFingerprint: 'source-1',
        sourceKind: 'pdf',
        sourceLocator: '',
        sourceName: 'sample.pdf'
      }
    }) as never
  );

  renderSection();

  expect(screen.getByTestId('pdf-document-state-empty')).toBeInTheDocument();
  expect(screen.getByText('PDF file not linked yet')).toBeInTheDocument();
});

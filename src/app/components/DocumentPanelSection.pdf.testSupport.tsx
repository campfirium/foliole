import type { ComponentProps } from 'react';

import { renderWithLocalization } from '../../shared/localization/testLocalization';

import { DocumentPanelSection } from './DocumentPanelSection';

const baseNode = {
  id: 'node-1',
  kind: 'topic' as const,
  title: 'Node 1',
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

export const defaultImportSource = {
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
  editableNodeId: 'node-1',
  editorAppearanceKey: 'appearance-1',
  editorContent: '# Node 1',
  editorNodeId: 'node-1',
  isEditorReadOnly: false,
  nodeOrder: ['node-1'],
  nodesById: { 'node-1': baseNode },
  onAdjustExistingHighlightRange: () => true,
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
  onResolveDocumentPositionAtViewportY: () => null,
  onRevealDocumentPosition: () => undefined,
  onRevealDocumentSelection: () => undefined,
  onSelectBreadcrumbNode: () => undefined,
  onSelectNode: () => undefined,
  showAnswerSection: false,
  trashedNodeIds: []
};

export function renderSection(overrides: Partial<ComponentProps<typeof DocumentPanelSection>> = {}) {
  return renderWithLocalization(<DocumentPanelSection {...defaultProps} {...overrides} />);
}

export function createPdfSourceDetails(overrides?: {
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
      pdfPageDimensions: [],
      sourceNodeId: 'node-1'
    }
  };
}

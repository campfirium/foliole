import { render, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';

const diagnosticsMocks = vi.hoisted(() => ({
  markDocumentPanelBound: vi.fn(),
  markNodeBodyPainted: vi.fn(),
  markNodeBodyReady: vi.fn(),
  recordComponentRender: vi.fn(),
  updateNodeImageState: vi.fn(),
  updatePdfSurfaceCacheStats: vi.fn(),
  updateSourceDetailsCacheStats: vi.fn()
}));

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    editorDisplayMode: 'preview' as const,
    toggleEditorDisplayMode: vi.fn()
  })
}));

vi.mock('../../shared/platform/performanceDiagnosticsProbe', () => diagnosticsMocks);

vi.mock('./DocumentPanelBody', () => ({
  DocumentPanelBody: () => <div data-testid="document-panel-body">Document body</div>
}));

vi.mock('./ReadwiseBookActionsPanel', () => ({
  ReadwiseBookActionsPanel: () => null
}));

vi.mock('./DocumentSourceUpdatePanel', () => ({
  DocumentSourceUpdatePanel: () => null
}));

vi.mock('./useNodeSourceUpdatePreview', () => ({
  useNodeSourceUpdatePreview: () => ({
    isLoading: false,
    value: null
  })
}));

import { DocumentPanelSection } from './DocumentPanelSection';

function createNode(content: string, hasContent = true) {
  return {
    id: 'node-1',
    kind: 'topic' as const,
    title: 'Node 1',
    parentNodeId: null,
    content,
    hasContent,
    anchorLink: null,
    reveal: null,
    hasReveal: false,
    review: null,
    createdAt: '',
    updatedAt: ''
  };
}

function createProps(
  overrides: Partial<ComponentProps<typeof DocumentPanelSection>> = {}
): ComponentProps<typeof DocumentPanelSection> {
  return {
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
    nodesById: { 'node-1': createNode('# Node 1') },
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
    showAnswerSection: false,
    ...overrides
  };
}

function renderSection(overrides: Partial<ComponentProps<typeof DocumentPanelSection>> = {}) {
  return render(<DocumentPanelSection {...createProps(overrides)} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('waits for the editor document before marking body readiness', async () => {
  const view = renderSection({ editorContent: '', nodesById: { 'node-1': createNode('', true) } });

  await waitFor(() => {
    expect(diagnosticsMocks.markNodeBodyReady).not.toHaveBeenCalled();
  });

  view.rerender(
    <DocumentPanelSection
      {...createProps({
        editorContent: 'Loaded content',
        nodesById: { 'node-1': createNode('Loaded content', true) }
      })}
    />
  );

  await waitFor(() => {
    expect(diagnosticsMocks.markNodeBodyPainted).toHaveBeenCalledWith('node-1');
    expect(diagnosticsMocks.markNodeBodyReady).toHaveBeenCalledWith('node-1');
  });
});

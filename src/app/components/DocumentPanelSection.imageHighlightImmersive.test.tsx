import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';

import { DocumentPanelSection } from './DocumentPanelSection';

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    editorDisplayMode: 'preview' as const,
    toggleEditorDisplayMode: vi.fn()
  })
}));
vi.mock('../../features/settings/context/MouseGestureSettingsProvider', () => ({
  useMouseGestureSettings: () => ({
    bindings: {},
    settings: {
      enabled: false,
      maxTrailPoints: 0,
      minDistance: 0,
      triggerButton: 'right'
    }
  })
}));

vi.mock('./ReadwiseBookActionsPanel', () => ({ ReadwiseBookActionsPanel: () => null }));
vi.mock('./useNodeSourceUpdatePreview', () => ({
  useNodeSourceUpdatePreview: () => ({ isLoading: false, value: null })
}));

it('renders an image highlight child node in immersive mode without crashing', () => {
  expect(() =>
    render(
      <DocumentPanelSection
        activeNodeId="node-2"
        canGoBack
        canGoForward
        canGoParent={false}
        contextMenu={null}
        documentMaxWidth={760}
        editableNodeId="node-2"
        editorAppearanceKey="appearance-1"
        editorContent="![Cover](asset://hash-1.png)"
        isDocumentResizing={false}
        isEditorReadOnly={false}
        isImmersiveEditing={false}
        isImmersiveMode
        editorNodeId="node-2"
        editorNodeViewState={undefined}
        nodeOrder={['node-1', 'node-2']}
        nodesById={{
          'node-1': {
            anchorLink: null,
            content: '![Cover](asset://hash-1.png)',
            createdAt: '',
            id: 'node-1',
            kind: 'topic',
            parentNodeId: null,
            reveal: '',
            review: null,
            title: 'Node 1',
            updatedAt: ''
          },
          'node-2': {
            anchorLink: {
              id: 'highlight-1',
              kind: 'highlight',
              locator: {
                from: 0,
                originalText: '![Cover](asset://hash-1.png)',
                to: 28
              }
            },
            content: '![Cover](asset://hash-1.png)',
            createdAt: '',
            id: 'node-2',
            imageRegions: [
              {
                attachmentId: 'hash-1',
                regions: [{ height: 1, id: 'highlight-1-image-0', width: 1, x: 0, y: 0 }]
              }
            ],
            kind: 'topic',
            parentNodeId: 'node-1',
            reveal: '',
            review: null,
            title: 'Node 1 highlight',
            updatedAt: ''
          }
        }}
        onAnswerChange={() => undefined}
        onCloseContextMenu={() => undefined}
        onCopyImage={() => undefined}
        onCreateCloze={() => undefined}
        onCreateHighlight={() => undefined}
        onCreatePdfHighlight={() => false}
        onCutImage={() => undefined}
        onDeleteImage={() => undefined}
        onEditorChange={() => undefined}
        onNodeContentChange={() => undefined}
        onEditorContextMenu={() => undefined}
        onEditorReady={() => undefined}
        onEnterImmersiveEdit={() => undefined}
        onExportImage={() => undefined}
        onGoBack={() => undefined}
        onGoForward={() => undefined}
        onGoParent={() => undefined}
        onPersistPdfViewState={() => undefined}
        onResetLayout={() => undefined}
        onResolveDocumentPositionAtViewportY={() => null}
        onRevealDocumentPosition={() => undefined}
        onRevealDocumentSelection={() => undefined}
        onSelectBreadcrumbNode={() => undefined}
        onSelectNode={() => undefined}
        onStartDocumentResize={() => undefined}
        showAnswerSection={false}
        trashedNodeIds={[]}
      />
    )
  ).not.toThrow();
});

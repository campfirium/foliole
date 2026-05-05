import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';

import type { Node } from '../../features/nodes/model/nodeTypes';

import { DocumentPanelSection } from './DocumentPanelSection';

const BASE_NODE_CONTENT = '![Cover](asset://hash-1.png)';
const DOCUMENT_PANEL_PROPS = {
  activeNodeId: 'node-2',
  canGoBack: true,
  canGoForward: true,
  canGoParent: false,
  contextMenu: null,
  documentMaxWidth: 760,
  editableNodeId: 'node-2',
  editorAppearanceKey: 'appearance-1',
  editorContent: BASE_NODE_CONTENT,
  editorNodeId: 'node-2',
  editorNodeViewState: undefined,
  isDocumentResizing: false,
  isEditorReadOnly: false,
  isImmersiveEditing: false,
  isImmersiveMode: true,
  nodeOrder: ['node-1', 'node-2'],
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
  onEnterImmersiveEdit: () => undefined,
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

function createImageHighlightNodes(): Record<string, Node> {
  return {
    'node-1': {
      anchorLink: null,
      content: BASE_NODE_CONTENT,
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
          originalText: BASE_NODE_CONTENT,
          to: 28
        }
      },
      content: BASE_NODE_CONTENT,
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
  };
}

function renderImageHighlightImmersivePanel() {
  return render(<DocumentPanelSection {...DOCUMENT_PANEL_PROPS} nodesById={createImageHighlightNodes()} />);
}

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
  expect(renderImageHighlightImmersivePanel).not.toThrow();
});

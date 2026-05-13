import { act, render } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';

import { DocumentPanelSection } from './DocumentPanelSection';

const imageClozePresentation = vi.hoisted(() => ({
  registerImageClozeEditorPresentation: vi.fn(),
  unregisterImageClozeEditorPresentation: vi.fn(),
  getImageClozeAnswerEditorNodeId: vi.fn((editorNodeId: string | null) =>
    editorNodeId ? `${editorNodeId}::answer` : null
  )
}));

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({
    editorDisplayMode: 'preview' as const,
    toggleEditorDisplayMode: vi.fn()
  })
}));

vi.mock('../../features/image-cloze/model/imageClozePresentation', () => imageClozePresentation);

vi.mock('./DocumentPanelBody', () => ({
  DocumentPanelBody: () => <div>Document body</div>
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

const baseNode = {
  id: 'node-1',
  kind: 'topic' as const,
  title: 'Node 1',
  parentNodeId: null,
  content: '![Cover](asset://hash-1.png)',
  anchorLink: null,
  imageRegions: null,
  reveal: '',
  review: null,
  createdAt: '',
  updatedAt: ''
};

const imageClozeChildNode = {
  ...baseNode,
  id: 'node-2',
  kind: 'item' as const,
  parentNodeId: 'node-1',
  anchorLink: {
    id: 'region-1',
    kind: 'cloze' as const,
    locator: {
      attachmentId: 'hash-1',
      height: 0.2,
      width: 0.3,
      x: 0.1,
      y: 0.2
    }
  },
  reveal: 'Paris'
};

function buildProps(trashedNodeIds: string[]): ComponentProps<typeof DocumentPanelSection> {
  return {
    activeNodeId: 'node-1',
    canGoBack: true,
    canGoForward: true,
    canGoParent: false,
    contextMenu: null,
    editableNodeId: 'node-1',
    editorAppearanceKey: 'appearance-1',
    editorContent: '![Cover](asset://hash-1.png)',
    isEditorReadOnly: false,
    editorNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': baseNode,
      'node-2': imageClozeChildNode
    },
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
    onResolveDocumentPositionAtViewportY: () => null,
    onRevealDocumentPosition: () => undefined,
    onRevealDocumentSelection: () => undefined,
    onSelectBreadcrumbNode: () => undefined,
    onSelectNode: () => undefined,
    showAnswerSection: false,
    trashedNodeIds
  };
}

it('re-registers the topic image presentation without the deleted child region', () => {
  imageClozePresentation.registerImageClozeEditorPresentation.mockClear();
  imageClozePresentation.unregisterImageClozeEditorPresentation.mockClear();

  const { rerender } = render(<DocumentPanelSection {...buildProps([])} />);
  act(() => {
    rerender(<DocumentPanelSection {...buildProps(['node-2'])} />);
  });

  expect(imageClozePresentation.unregisterImageClozeEditorPresentation).toHaveBeenCalledWith('node-1');
});

import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

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
  DocumentPanelBody: () => <div data-testid="document-panel-body">Document body</div>
}));

vi.mock('../../features/image-cloze/components/ImageClozeCardView', () => ({
  ImageClozeCardView: () => <div data-testid="image-cloze-card-view">Legacy image cloze</div>
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

beforeEach(() => {
  imageClozePresentation.registerImageClozeEditorPresentation.mockClear();
  imageClozePresentation.unregisterImageClozeEditorPresentation.mockClear();
});

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

function renderSectionWithProps(overrides: Partial<ComponentProps<typeof DocumentPanelSection>>) {
  return render(
    <DocumentPanelSection
      activeNodeId="node-1"
      canGoBack
      canGoForward
      canGoParent={false}
      contextMenu={null}
      documentMaxWidth={760}
      editableNodeId="node-1"
      editorAppearanceKey="appearance-1"
      editorContent="# Node 1"
      isEditorReadOnly={false}
      editorNodeId="node-1"
      editorNodeViewState={undefined}
      isDocumentResizing={false}
      nodeOrder={['node-1']}
      nodesById={{ 'node-1': baseNode }}
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
      {...overrides}
    />
  );
}

it('renders image cloze items through the standard document body shell', () => {
  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodesById: {
      'node-1': {
        ...baseNode,
        kind: 'item',
        content: '![Cover](asset://hash-1.png)',
        anchorLink: {
          id: 'cloze-1',
          kind: 'cloze',
          locator: {
            attachmentId: 'hash-1',
            height: 0.2,
            width: 0.3,
            x: 0.1,
            y: 0.2
          }
        },
        reveal: 'Paris'
      }
    }
  });

  expect(screen.getByTestId('document-panel-body')).toBeInTheDocument();
});

it('renders legacy empty-content image cloze items through the compatibility card view', () => {
  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodesById: {
      'node-1': {
        ...baseNode,
        kind: 'item',
        hasContent: false,
        anchorLink: {
          id: 'cloze-1',
          kind: 'cloze',
          locator: {
            attachmentId: 'hash-1',
            height: 0.2,
            width: 0.3,
            x: 0.1,
            y: 0.2
          }
        },
        reveal: 'Paris'
      }
    }
  });

  expect(screen.getByTestId('image-cloze-card-view')).toBeInTheDocument();
});

it('registers saved image regions for source nodes so the original image can show all cloze marks', () => {
  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodesById: {
      'node-1': {
        ...baseNode,
        content: '![Cover](asset://hash-1.png)',
        imageRegions: [
          {
            attachmentId: 'hash-1',
            regions: [
              {
                id: 'region-1',
                height: 0.2,
                width: 0.3,
                x: 0.1,
                y: 0.2
              }
            ]
          }
        ]
      }
    }
  });

  expect(imageClozePresentation.registerImageClozeEditorPresentation).toHaveBeenCalledWith(
    'node-1',
    expect.objectContaining({
      canCreate: true,
      hiddenRegionIds: [],
      outlinedRegionIds: ['region-1'],
      regions: [
        expect.objectContaining({
          attachmentId: 'hash-1',
          id: 'region-1'
        })
      ]
    })
  );
});

it('derives image regions from existing cloze child nodes when the parent has no imageRegions yet', () => {
  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2'],
    nodesById: {
      'node-1': {
        ...baseNode,
        content: '![Cover](asset://hash-1.png)'
      },
      'node-2': {
        ...baseNode,
        id: 'node-2',
        kind: 'item',
        parentNodeId: 'node-1',
        anchorLink: {
          id: 'region-legacy',
          kind: 'cloze',
          locator: {
            attachmentId: 'hash-1',
            height: 0.2,
            width: 0.3,
            x: 0.1,
            y: 0.2
          }
        },
        reveal: 'Paris'
      }
    }
  });

  expect(imageClozePresentation.registerImageClozeEditorPresentation).toHaveBeenCalledWith(
    'node-1',
    expect.objectContaining({
      canCreate: true,
      hiddenRegionIds: [],
      outlinedRegionIds: ['region-legacy'],
      regions: [
        expect.objectContaining({
          attachmentId: 'hash-1',
          id: 'region-legacy'
        })
      ]
    })
  );
});

it('registers every region of a grouped image cloze item when the item is focused', () => {
  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodesById: {
      'node-1': {
        ...baseNode,
        kind: 'item',
        content: '![Cover](asset://hash-1.png)',
        anchorLink: {
          id: 'region-1',
          kind: 'cloze',
          locator: {
            attachmentId: 'hash-1',
            height: 0.2,
            width: 0.3,
            x: 0.1,
            y: 0.2
          }
        },
        imageRegions: [
          {
            attachmentId: 'hash-1',
            regions: [
              {
                id: 'region-1',
                height: 0.2,
                width: 0.3,
                x: 0.1,
                y: 0.2
              },
              {
                id: 'region-2',
                height: 0.12,
                width: 0.18,
                x: 0.42,
                y: 0.55
              }
            ]
          }
        ],
        reveal: 'Paris'
      }
    }
  });

  expect(imageClozePresentation.registerImageClozeEditorPresentation).toHaveBeenCalledWith(
    'node-1',
    expect.objectContaining({
      canCreate: false,
      hiddenRegionIds: ['region-1', 'region-2'],
      regions: [
        expect.objectContaining({ id: 'region-1' }),
        expect.objectContaining({ id: 'region-2' })
      ]
    })
  );
});

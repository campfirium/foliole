import { beforeEach, expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';

import { baseNode, renderSectionWithProps } from './DocumentPanelSection.imageClozeTestSupport';

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
vi.mock('./DocumentPanelBody', () => ({ DocumentPanelBody: () => <div /> }));
vi.mock('../../features/image-cloze/components/ImageClozeCardView', () => ({ ImageClozeCardView: () => <div /> }));
vi.mock('./ReadwiseBookActionsPanel', () => ({ ReadwiseBookActionsPanel: () => null }));
vi.mock('./useNodeSourceUpdatePreview', () => ({
  useNodeSourceUpdatePreview: () => ({ isLoading: false, value: null })
}));

beforeEach(() => {
  imageClozePresentation.registerImageClozeEditorPresentation.mockClear();
  imageClozePresentation.unregisterImageClozeEditorPresentation.mockClear();
});

const directRegion = {
  id: 'region-2',
  height: 0.2,
  width: 0.3,
  x: 0.1,
  y: 0.2
};

const nestedRegion = {
  id: 'region-3',
  height: 0.18,
  width: 0.22,
  x: 0.32,
  y: 0.28
};

function createNestedImageClozeNodes() {
  return {
    'node-1': {
      ...baseNode,
      content: '![Cover](asset://hash-1.png)',
      imageRegions: [
        {
          attachmentId: 'hash-1',
          regions: [directRegion]
        }
      ]
    },
    'node-2': {
      ...baseNode,
      id: 'node-2',
      kind: 'item' as const,
      parentNodeId: 'node-1',
      content: '![Cover](asset://hash-1.png)',
      anchorLink: {
        id: directRegion.id,
        kind: 'cloze' as const,
        locator: {
          attachmentId: 'hash-1',
          ...directRegion
        }
      },
      imageRegions: [
        {
          attachmentId: 'hash-1',
          regions: [directRegion, nestedRegion]
        }
      ]
    },
    'node-3': {
      ...baseNode,
      id: 'node-3',
      kind: 'item' as const,
      parentNodeId: 'node-2',
      anchorLink: {
        id: nestedRegion.id,
        kind: 'cloze' as const,
        locator: {
          attachmentId: 'hash-1',
          ...nestedRegion
        }
      },
      reveal: 'Cloud opening'
    }
  };
}

it('does not surface a grandchild image cloze region on the top-level source node', () => {
  renderSectionWithProps({
    activeNodeId: 'node-1',
    editorNodeId: 'node-1',
    nodeOrder: ['node-1', 'node-2', 'node-3'],
    nodesById: createNestedImageClozeNodes()
  });

  expect(imageClozePresentation.registerImageClozeEditorPresentation).toHaveBeenCalledWith(
    'node-1',
    expect.objectContaining({
      canCreate: true,
      hiddenRegionIds: [],
      outlinedRegionIds: ['region-2'],
      regions: [expect.objectContaining({ attachmentId: 'hash-1', id: 'region-2' })]
    })
  );
  expect(imageClozePresentation.registerImageClozeEditorPresentation).not.toHaveBeenCalledWith(
    'node-1',
    expect.objectContaining({
      outlinedRegionIds: expect.arrayContaining(['region-3'])
    })
  );
});

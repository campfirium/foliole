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

it('derives image regions from highlight child nodes so image highlights stay visible in reading mode', () => {
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
        content: '![Cover](asset://hash-1.png)',
        kind: 'topic',
        parentNodeId: 'node-1',
        anchorLink: {
          id: 'highlight-1',
          kind: 'highlight',
          locator: {
            from: 0,
            originalText: '![Cover](asset://hash-1.png)',
            to: 27
          }
        },
        imageRegions: [
          {
            attachmentId: 'hash-1',
            regions: [
              {
                id: 'highlight-1-image-0',
                height: 1,
                width: 1,
                x: 0,
                y: 0
              }
            ]
          }
        ],
        reveal: null
      }
    }
  });

  expect(imageClozePresentation.registerImageClozeEditorPresentation).toHaveBeenCalledWith(
    'node-1',
    expect.objectContaining({
      outlinedRegionIds: ['highlight-1-image-0'],
      regions: [
        expect.objectContaining({
          attachmentId: 'hash-1',
          id: 'highlight-1-image-0'
        })
      ]
    })
  );
});

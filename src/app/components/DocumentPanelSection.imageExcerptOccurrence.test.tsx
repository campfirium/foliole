import { beforeEach, expect, it, vi } from 'vitest';

import '../../test/reactPdfMock';

import { baseNode, renderSectionWithProps } from './DocumentPanelSection.imageClozeTestSupport';

const presentation = vi.hoisted(() => ({
  getImageClozeAnswerEditorNodeId: vi.fn((id: string | null) => id ? `${id}::answer` : null),
  registerImageClozeEditorPresentation: vi.fn(),
  unregisterImageClozeEditorPresentation: vi.fn()
}));

vi.mock('../../features/settings/context/AppearanceSettingsProvider', () => ({
  useAppearanceSettings: () => ({ editorDisplayMode: 'preview' as const, toggleEditorDisplayMode: vi.fn() })
}));
vi.mock('../../features/image-cloze/model/imageClozePresentation', () => presentation);
vi.mock('./DocumentPanelBody', () => ({ DocumentPanelBody: () => <div /> }));
vi.mock('./ReadwiseBookActionsPanel', () => ({ ReadwiseBookActionsPanel: () => null }));
vi.mock('./useNodeSourceUpdatePreview', () => ({ useNodeSourceUpdatePreview: () => ({ isLoading: false, value: null }) }));

beforeEach(() => presentation.registerImageClozeEditorPresentation.mockClear());

function excerptNode(image: string, from: number) {
  return {
    ...baseNode,
    id: 'excerpt-1',
    parentNodeId: 'node-1',
    anchorLink: {
      id: 'excerpt-anchor', kind: 'image-excerpt' as const,
      locator: { from, originalText: image, to: from + image.length }
    },
    imageRegions: [{
      attachmentId: 'hash-1',
      regions: [{ height: 0.2, id: 'excerpt-region', width: 0.3, x: 0.1, y: 0.2 }]
    }]
  };
}

it('registers the exact markdown image occurrence range for an image excerpt', () => {
  const image = '![Cover](asset://hash-1.png)';
  const content = `${image}\nBetween\n${image}`;
  const secondFrom = content.lastIndexOf(image);
  renderSectionWithProps({
    nodesById: { 'node-1': { ...baseNode, content }, 'excerpt-1': excerptNode(image, secondFrom) }
  });

  expect(presentation.registerImageClozeEditorPresentation).toHaveBeenCalledWith(
    'node-1',
    expect.objectContaining({
      regions: [expect.objectContaining({
        imageRange: { from: secondFrom, to: secondFrom + image.length },
        openNodeId: 'excerpt-1'
      })]
    })
  );
});

it('does not guess a projection when the occurrence locator no longer matches', () => {
  const image = '![Cover](asset://hash-1.png)';
  renderSectionWithProps({
    nodesById: {
      'node-1': { ...baseNode, content: `Changed\n${image}` },
      'excerpt-1': excerptNode(image, 0)
    }
  });

  expect(presentation.registerImageClozeEditorPresentation).not.toHaveBeenCalled();
});

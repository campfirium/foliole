import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { expect, it, vi } from 'vitest';

import type { ImageClozeDraftRegion, ImageClozeSourcePayload } from '../../features/image-cloze/model/imageCloze';
import { IMAGE_CLOZE_CREATE_EVENT, IMAGE_CLOZE_DELETE_EVENT } from '../../features/image-cloze/model/imageClozeEvents';

import { useEditorContextCommands } from './useEditorContextCommands';

const content = 'Before\n\n![Cover](asset://hash-1.png)\n\nAfter';
const imageMarkdown = '![Cover](asset://hash-1.png)';

function renderImageClozeCommands(
  createImageClozeNodes: (
    parentNodeId: string,
    attachmentId: string,
    sourcePayload: ImageClozeSourcePayload,
    regions: ImageClozeDraftRegion[]
  ) => string[],
  deleteImageClozeRegion = vi.fn<(nodeId: string, regionId: string) => void>()
) {
  const editorRef = {
    current: {
      getContent: vi.fn(() => content)
    }
  } as never;
  const nodesById = {
    'node-1': { id: 'node-1', content, title: 'Welcome to Foliole' },
    'node-item': {
      id: 'node-item',
      parentNodeId: 'node-1',
      anchorLink: { id: 'region-1', kind: 'cloze' }
    }
  } as never;

  renderHook(() =>
    useEditorContextCommands({
      activeNode: nodesById['node-1'],
      activeNodeId: 'node-1',
      createChildNode: vi.fn(() => 'note-1'),
      createHighlightNodeFromSelection: vi.fn(),
      createImageClozeNodes,
      createQANodeFromSelection: vi.fn(),
      deleteNodePermanently: vi.fn(),
      deleteImageClozeRegion,
      editorRef,
      isTrashViewOpen: false,
      trashedNodeIds: [],
      nodesById,
      onExitImmersiveMode: vi.fn(),
      onSelectNode: vi.fn(),
      updateNodeContent: vi.fn()
    })
  );

  return { deleteImageClozeRegion };
}

function dispatchImageClozeCreateEvent() {
  const imageFrom = content.indexOf(imageMarkdown);
  act(() => {
    window.dispatchEvent(
      new CustomEvent(IMAGE_CLOZE_CREATE_EVENT, {
        detail: {
          attachmentId: 'hash-1',
          imageRange: { from: imageFrom, to: imageFrom + imageMarkdown.length },
          regions: [
            {
              answer: '',
              attachmentId: 'hash-1',
              height: 0.2,
              id: 'region-1',
              width: 0.3,
              x: 0.1,
              y: 0.2
            }
          ]
        }
      })
    );
  });
}

it('creates an image cloze item directly from the image cloze widget event', () => {
  const createImageClozeNodes = vi.fn(() => ['node-image-cloze']);
  renderImageClozeCommands(createImageClozeNodes);
  dispatchImageClozeCreateEvent();

  expect(createImageClozeNodes).toHaveBeenCalledWith(
    'node-1',
    'hash-1',
    {
      promptContent: 'Before\n\n![Cover](asset://hash-1.png)\n\nAfter',
      revealContent: '![Cover](asset://hash-1.png)'
    },
    [
      {
        answer: '',
        attachmentId: 'hash-1',
        height: 0.2,
        id: 'region-1',
        width: 0.3,
        x: 0.1,
        y: 0.2
      }
    ]
  );
});

it('deletes the linked image cloze item directly from the image cloze widget event', () => {
  const createImageClozeNodes = vi.fn(() => ['node-image-cloze']);
  const { deleteImageClozeRegion } = renderImageClozeCommands(createImageClozeNodes);

  act(() => {
    window.dispatchEvent(
      new CustomEvent(IMAGE_CLOZE_DELETE_EVENT, {
        detail: {
          attachmentId: 'hash-1',
          regionId: 'region-1'
        }
      })
    );
  });

  expect(deleteImageClozeRegion).toHaveBeenCalledWith('node-1', 'hash-1', 'region-1');
});

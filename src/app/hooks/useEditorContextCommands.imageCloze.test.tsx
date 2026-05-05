import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { expect, it, vi } from 'vitest';

import { IMAGE_CLOZE_CREATE_EVENT } from '../../features/image-cloze/model/imageClozeEvents';

import { useEditorContextCommands } from './useEditorContextCommands';

const content = 'Before\n\n![Cover](asset://hash-1.png)\n\nAfter';
const imageMarkdown = '![Cover](asset://hash-1.png)';

function renderImageClozeCommands(createImageClozeNodes: ReturnType<typeof vi.fn>) {
  const editorRef = {
    current: {
      getContent: vi.fn(() => content)
    }
  } as never;

  renderHook(() =>
    useEditorContextCommands({
      activeNode: { id: 'node-1', content, title: 'Welcome to Foliole' } as never,
      activeNodeId: 'node-1',
      createHighlightNodeFromSelection: vi.fn(),
      createImageClozeNodes,
      createQANodeFromSelection: vi.fn(),
      editorRef,
      isTrashViewOpen: false,
      updateNodeContent: vi.fn()
    })
  );
}

function dispatchImageClozeCreateEvent() {
  const imageFrom = content.indexOf(imageMarkdown);
  act(() => {
    window.dispatchEvent(
      new CustomEvent(IMAGE_CLOZE_CREATE_EVENT, {
        detail: {
          attachmentId: 'hash-1',
          imageRange: { from: imageFrom, to: imageFrom + imageMarkdown.length },
          region: {
            answer: '',
            attachmentId: 'hash-1',
            height: 0.2,
            id: 'region-1',
            width: 0.3,
            x: 0.1,
            y: 0.2
          }
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

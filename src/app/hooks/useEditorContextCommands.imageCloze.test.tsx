import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useEditorContextCommands } from './useEditorContextCommands';

function createImageTarget() {
  const createImageClozeNodes = vi.fn(() => ['node-image-cloze']);
  const imageTarget = document.createElement('img');
  const imageWidget = document.createElement('span');
  imageWidget.dataset.mdImageAttachmentId = 'hash-1';
  imageWidget.dataset.mdImageFrom = '3';
  imageWidget.dataset.mdImageSource = 'asset://hash-1.png';
  imageWidget.dataset.mdImageTo = '27';
  imageWidget.append(imageTarget);

  return { createImageClozeNodes, imageTarget };
}

function renderImageClozeCommands(createImageClozeNodes: ReturnType<typeof vi.fn>) {
  return renderHook(() =>
    useEditorContextCommands({
      activeNode: { id: 'node-1', content: '![Cover](asset://hash-1.png)', title: 'Welcome to Foliole' } as never,
      activeNodeId: 'node-1',
      createHighlightNodeFromSelection: vi.fn(),
      createImageClozeNodes,
      createQANodeFromSelection: vi.fn(),
      editorRef: { current: null },
      isTrashViewOpen: false,
      updateNodeContent: vi.fn()
    })
  );
}

it('opens and saves the image cloze composer from an attachment image', () => {
  const { createImageClozeNodes, imageTarget } = createImageTarget();
  const { result } = renderImageClozeCommands(createImageClozeNodes);

  act(() => {
    result.current.handleEditorContextMenu({
      clientX: 40,
      clientY: 48,
      preventDefault: vi.fn(),
      target: imageTarget
    } as never);
  });

  act(() => {
    result.current.handleCreateImageCloze();
  });

  expect(result.current.imageClozeComposer).toEqual({
    attachmentId: 'hash-1',
    parentNodeId: 'node-1'
  });

  let createdIds: string[] = [];
  act(() => {
    createdIds = result.current.handleSaveImageCloze([
      {
        answer: 'Paris',
        attachmentId: 'hash-1',
        height: 0.2,
        id: 'region-1',
        width: 0.3,
        x: 0.1,
        y: 0.2
      }
    ]);
  });

  expect(createdIds).toEqual(['node-image-cloze']);
  expect(createImageClozeNodes).toHaveBeenCalledWith('node-1', 'hash-1', [
    {
      answer: 'Paris',
      attachmentId: 'hash-1',
      height: 0.2,
      id: 'region-1',
      width: 0.3,
      x: 0.1,
      y: 0.2
    }
  ]);
  expect(result.current.imageClozeComposer).toBeNull();
});

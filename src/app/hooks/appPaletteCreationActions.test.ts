import { expect, it, vi } from 'vitest';

import { createPaletteCreationActions } from './appPaletteCreationActions';

function createActions(createRootNode: ReturnType<typeof vi.fn>) {
  const closeTrashView = vi.fn();
  const focus = vi.fn();
  const actions = createPaletteCreationActions({
    layoutProps: {
      document: { editorAdapterRef: { current: { focus } } },
      navigation: { onSelectNodeInVirtualView: vi.fn() },
      virtualView: { onOpenVirtualView: vi.fn() }
    },
    trash: { closeTrashView },
    ws: { createRootNode, createVirtualNode: vi.fn() }
  } as unknown as Parameters<typeof createPaletteCreationActions>[0]);
  return { actions, closeTrashView, focus };
}

it('focuses the existing body editor after topic creation succeeds', async () => {
  let finishCreation: (nodeId: string) => void = () => undefined;
  const creation = new Promise<string>((resolve) => {
    finishCreation = resolve;
  });
  const createRootNode = vi.fn(() => creation);
  const { actions, closeTrashView, focus } = createActions(createRootNode);

  const result = actions.createTopic();

  expect(closeTrashView).toHaveBeenCalledOnce();
  expect(createRootNode).toHaveBeenCalledWith('', 'topic');
  expect(focus).not.toHaveBeenCalled();

  finishCreation('node-new');
  await result;
  expect(focus).toHaveBeenCalledOnce();
});

it('keeps focus unchanged when topic creation fails', async () => {
  const createRootNode = vi.fn(async () => null);
  const { actions, focus } = createActions(createRootNode);

  await actions.createTopic();

  expect(focus).not.toHaveBeenCalled();
});

it('keeps folder and item creation from taking body editor focus', async () => {
  const createRootNode = vi.fn(async () => 'node-new');
  const { actions, focus } = createActions(createRootNode);

  await actions.createFolder();
  await actions.createItem();

  expect(focus).not.toHaveBeenCalled();
});

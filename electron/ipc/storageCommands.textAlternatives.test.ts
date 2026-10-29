// @vitest-environment node
import type { BrowserWindow } from 'electron';
import { beforeEach, expect, it, vi } from 'vitest';

const mutations = vi.hoisted(() => ({ promote: vi.fn(), dismiss: vi.fn(), notify: vi.fn() }));
vi.mock('../database/nodeTextAlternatives.js', () => ({
  promoteNodeTextAlternative: mutations.promote,
  dismissNodeTextAlternative: mutations.dismiss,
  loadNodeTextAlternativePreview: vi.fn()
}));
vi.mock('./workspaceContentChangedEvents.js', () => ({ notifyWorkspaceContentChanged: mutations.notify }));

import { handleStorageCommand } from './storageCommands.js';

beforeEach(() => { vi.clearAllMocks(); });

it.each(['promote', 'dismiss'] as const)('requires both string identifiers for %s', async action => {
  const command = `${action}_node_text_alternative`;
  for (const args of [{ alternative_id: 'alt' }, { node_id: 1, alternative_id: 'alt' },
    { node_id: 'topic' }, { node_id: 'topic', alternative_id: {} }]) {
    await expect(handleStorageCommand(command, args)).rejects.toThrow('invalid argument');
  }
  expect(mutations[action]).not.toHaveBeenCalled();
  expect(mutations.notify).not.toHaveBeenCalled();
});

it('notifies the originating window after adopting a body committed outside the renderer', async () => {
  const origin = {} as BrowserWindow;
  mutations.promote.mockResolvedValue({ status: 'promoted', node_id: 'topic' });
  await handleStorageCommand('promote_node_text_alternative', {
    node_id: 'topic', alternative_id: 'alt'
  }, origin);
  expect(mutations.notify).toHaveBeenCalledExactlyOnceWith();
});

it.each([['promote', 'promoted'], ['dismiss', 'dismissed']] as const)('routes %s with its owner and only notifies committed changes', async (action, status) => {
  const command = `${action}_node_text_alternative`;
  const args = { node_id: 'topic', alternative_id: 'alt' };
  mutations[action].mockResolvedValue({ status, node_id: 'topic' });
  await expect(handleStorageCommand(command, args)).resolves.toEqual({ status, node_id: 'topic' });
  expect(mutations[action]).toHaveBeenCalledWith('topic', 'alt');
  expect(mutations.notify).toHaveBeenCalledTimes(1);
  mutations.notify.mockClear();
  mutations[action].mockResolvedValue({ status: 'unavailable', node_id: null });
  await handleStorageCommand(command, args);
  expect(mutations.notify).not.toHaveBeenCalled();
});

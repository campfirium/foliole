import { afterEach, expect, it, vi } from 'vitest';

import type { NativeInvoke } from '../../../../lib/platform/nativeContract';

import {
  loadRuntimeReadwiseSourceResyncActionState,
  resyncRuntimeReadwiseSource
} from './readwiseSourceResyncRuntimeRepository';

function installInvoke(invoke: NativeInvoke) {
  window.electronAPI = {
    invoke,
    onManagedInboxUpdated: vi.fn(() => () => undefined),
    onNativeMenuCommand: vi.fn(() => () => undefined),
    onWindowResized: vi.fn(() => () => undefined)
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('loads a validated source action state with authority context', async () => {
  const invoke = vi.fn().mockResolvedValue({
    body_authority: 'original_epub', category: 'epub', node_id: 'source', status: 'ready'
  });
  installInvoke(invoke);
  await expect(loadRuntimeReadwiseSourceResyncActionState('source')).resolves.toMatchObject({
    body_authority: 'original_epub', category: 'epub', status: 'ready'
  });
  expect(invoke).toHaveBeenCalledWith('load_readwise_source_resync_action_state', { node_id: 'source' });
});

it('rejects malformed state and result payloads', async () => {
  const invoke = vi.fn().mockResolvedValue({ node_id: 'source', status: 'ready' });
  installInvoke(invoke);
  await expect(loadRuntimeReadwiseSourceResyncActionState('source')).resolves.toBeNull();
  invoke.mockResolvedValue({ node_id: 'source', status: 'unexpected' });
  await expect(resyncRuntimeReadwiseSource('source')).resolves.toBeNull();
});

it('invokes one typed resync mutation', async () => {
  const invoke = vi.fn().mockResolvedValue({ node_id: 'source', status: 'completed' });
  installInvoke(invoke);
  await expect(resyncRuntimeReadwiseSource('source')).resolves.toEqual({
    node_id: 'source', status: 'completed'
  });
  expect(invoke).toHaveBeenCalledWith('resync_readwise_source', { node_id: 'source' });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/bridge';

import { workspacePersistStorage } from './workspacePersistStorage';

vi.mock('../shared/platform/bridge', () => ({
  getRuntimeInvoke: vi.fn()
}));

describe('workspacePersistStorage', () => {
  beforeEach(() => {
    vi.mocked(getRuntimeInvoke).mockReset();
    window.localStorage.clear();
  });

  it('uses runtime invoke to load persisted workspace payload when available', async () => {
    const invoke = vi.fn().mockResolvedValue('{"state":{"activeNodeId":"node-1"}}');
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');

    expect(invoke).toHaveBeenCalledWith('load_workspace_state', { storageKey: 'foliole-workspace-v1' });
    expect(value).toBe('{"state":{"activeNodeId":"node-1"}}');
  });

  it('falls back to localStorage for load when runtime invoke is unavailable', async () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);
    window.localStorage.setItem('foliole-workspace-v1', '{"state":{"activeNodeId":"node-2"}}');

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');

    expect(value).toBe('{"state":{"activeNodeId":"node-2"}}');
  });

  it('migrates legacy localStorage payload to runtime storage when runtime payload is empty', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(undefined);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    window.localStorage.setItem('foliole-workspace-v1', '{"state":{"activeNodeId":"node-legacy"}}');

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');

    expect(value).toBe('{"state":{"activeNodeId":"node-legacy"}}');
    expect(invoke).toHaveBeenNthCalledWith(1, 'load_workspace_state', { storageKey: 'foliole-workspace-v1' });
    expect(invoke).toHaveBeenNthCalledWith(2, 'save_workspace_state', {
      storageKey: 'foliole-workspace-v1',
      payload: '{"state":{"activeNodeId":"node-legacy"}}'
    });
  });

  it('uses runtime invoke to save and clear persisted payload', async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    await workspacePersistStorage.setItem('foliole-workspace-v1', '{"state":{"activeNodeId":"node-3"}}');
    await workspacePersistStorage.removeItem('foliole-workspace-v1');

    expect(invoke).toHaveBeenNthCalledWith(1, 'save_workspace_state', {
      storageKey: 'foliole-workspace-v1',
      payload: '{"state":{"activeNodeId":"node-3"}}'
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'clear_workspace_state', { storageKey: 'foliole-workspace-v1' });
  });

  it('falls back to localStorage on runtime invoke failure', async () => {
    const invoke = vi.fn().mockRejectedValue(new Error('runtime unavailable'));
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    await workspacePersistStorage.setItem('foliole-workspace-v1', '{"state":{"activeNodeId":"node-4"}}');
    expect(window.localStorage.getItem('foliole-workspace-v1')).toBe('{"state":{"activeNodeId":"node-4"}}');

    await workspacePersistStorage.removeItem('foliole-workspace-v1');
    expect(window.localStorage.getItem('foliole-workspace-v1')).toBeNull();
  });
});

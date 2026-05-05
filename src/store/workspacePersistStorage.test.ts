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

  it('loads persisted workspace payload from localStorage only', async () => {
    const invoke = vi.fn();
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    window.localStorage.setItem('foliole-workspace-v1', '{"state":{"activeNodeId":"node-2"}}');

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');

    expect(value).toBe('{"state":{"activeNodeId":"node-2"}}');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('saves and clears persisted payload through localStorage only', async () => {
    const invoke = vi.fn();
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);

    await workspacePersistStorage.setItem('foliole-workspace-v1', '{"state":{"activeNodeId":"node-3"}}');
    expect(window.localStorage.getItem('foliole-workspace-v1')).toBe('{"state":{"activeNodeId":"node-3"}}');

    await workspacePersistStorage.removeItem('foliole-workspace-v1');
    expect(window.localStorage.getItem('foliole-workspace-v1')).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});

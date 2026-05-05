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

  it('loads persisted workspace payload from sqlite runtime snapshot in desktop mode', async () => {
    const invoke = vi.fn();
    invoke.mockResolvedValue({
      activeNodeId: 'node-2',
      nodeOrder: ['node-1', 'node-2'],
      nodesById: {},
      trashedNodeIds: ['node-1']
    });
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    window.localStorage.setItem('foliole-workspace-v1', '{"state":{"activeNodeId":"node-2"}}');

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');

    expect(value).toBe(
      '{"state":{"activeNodeId":"node-2","nodeOrder":["node-1","node-2"],"nodesById":{},"trashedNodeIds":["node-1"]},"version":0}'
    );
    expect(invoke).toHaveBeenCalledWith('load_workspace_snapshot');
  });

  it('does not read localStorage in desktop mode when sqlite snapshot is empty', async () => {
    const invoke = vi.fn();
    invoke.mockResolvedValue(null);
    vi.mocked(getRuntimeInvoke).mockReturnValue(invoke);
    window.localStorage.setItem('foliole-workspace-v1', '{"state":{"activeNodeId":"node-3"}}');

    const value = await workspacePersistStorage.getItem('foliole-workspace-v1');

    expect(value).toBeNull();
    expect(window.localStorage.getItem('foliole-workspace-v1')).toBe('{"state":{"activeNodeId":"node-3"}}');
    expect(invoke).toHaveBeenCalledWith('load_workspace_snapshot');
  });

  it('saves and clears persisted payload through localStorage in web mode only', async () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(null);

    await workspacePersistStorage.setItem('foliole-workspace-v1', '{"state":{"activeNodeId":"node-3"}}');
    expect(window.localStorage.getItem('foliole-workspace-v1')).toBe('{"state":{"activeNodeId":"node-3"}}');

    await workspacePersistStorage.removeItem('foliole-workspace-v1');
    expect(window.localStorage.getItem('foliole-workspace-v1')).toBeNull();
  });

  it('does not write workspace payload into localStorage in desktop mode', async () => {
    vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn());

    await workspacePersistStorage.setItem('foliole-workspace-v1', '{"state":{"activeNodeId":"node-4"}}');
    expect(window.localStorage.getItem('foliole-workspace-v1')).toBeNull();
  });
});

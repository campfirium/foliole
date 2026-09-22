import { beforeEach, expect, it, vi } from 'vitest';

import { getRuntimeInvoke } from '../shared/platform/runtimeInvoke';

import { workspacePersistStoreStorage } from './workspacePersistStorage';

vi.mock('../shared/platform/runtimeInvoke', () => ({
  getRuntimeInvoke: vi.fn()
}));

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(getRuntimeInvoke).mockReset();
});

it('drops native persist writes before JSON serialization', () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(vi.fn());
  const state = {} as Record<string, unknown>;
  Object.defineProperty(state, 'nodesById', {
    enumerable: true,
    get() {
      throw new Error('native no-op persistence must not inspect the workspace');
    }
  });

  expect(() => workspacePersistStoreStorage.setItem('foliole-workspace-v1', {
    state: state as never,
    version: 0
  })).not.toThrow();
  expect(window.localStorage.getItem('foliole-workspace-v1')).toBeNull();
});

it('serializes the complete browser fallback payload', () => {
  vi.mocked(getRuntimeInvoke).mockReturnValue(null);
  workspacePersistStoreStorage.setItem('foliole-workspace-v1', {
    state: { activeNodeId: 'node-1' } as never,
    version: 0
  });

  expect(window.localStorage.getItem('foliole-workspace-v1')).toBe(
    '{"state":{"activeNodeId":"node-1"},"version":0}'
  );
});

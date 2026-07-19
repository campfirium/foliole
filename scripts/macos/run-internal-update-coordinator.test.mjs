import { describe, expect, it, vi } from 'vitest';

import { coordinateInternalUpdate } from './run-internal-update-coordinator.mjs';

const REVISION = 'a'.repeat(40);

describe('Internal update coordinator', () => {
  it('builds the selected revision and clears only after success', async () => {
    const clearRequests = vi.fn();
    const update = vi.fn(async () => ({ status: 'installed' }));
    await expect(coordinateInternalUpdate({ repositoryRoot: '/repo', stateRoot: '/state' }, {
      clearRequests,
      resolveRequest: () => ({ requestedAt: 42, revision: REVISION }),
      update,
      waitForRequests: async () => [{ requestedAt: 42, revision: REVISION }]
    })).resolves.toEqual({ status: 'installed' });
    expect(update).toHaveBeenCalledWith({
      repositoryRoot: '/repo', revision: REVISION, stateRoot: '/state'
    });
    expect(clearRequests).toHaveBeenCalledWith('/state', 42);
  });

  it('preserves pending requests when the build fails', async () => {
    const clearRequests = vi.fn();
    await expect(coordinateInternalUpdate({ repositoryRoot: '/repo', stateRoot: '/state' }, {
      clearRequests,
      resolveRequest: () => ({ requestedAt: 42, revision: REVISION }),
      update: async () => { throw new Error('build failed'); },
      waitForRequests: async () => [{ requestedAt: 42, revision: REVISION }]
    })).rejects.toThrow('build failed');
    expect(clearRequests).not.toHaveBeenCalled();
  });
});

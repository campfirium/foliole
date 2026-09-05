import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSyncState,
  resetCompanionWorkspaceSyncFlowMocks,
  syncPlatformMock
} from './companionWorkspaceSyncFlow.testHarness';

describe('manual companion workspace sync', () => {
  beforeEach(resetCompanionWorkspaceSyncFlowMocks);

  it('resolves the saved desktop target while automatic participation is paused', async () => {
    const { tryForegroundAutoSync } = await import('./companionWorkspaceSyncFlow');

    await tryForegroundAutoSync({
      cancelled: () => false,
      setError: vi.fn(),
      setReadableArticle: vi.fn(),
      setState: vi.fn(),
      setSyncProgress: vi.fn(),
      setStatus: vi.fn(),
      state: createSyncState(),
      triggerReason: 'manual'
    });

    expect(syncPlatformMock.resolveReachableCompanionWorkspaceSyncEndpoints).toHaveBeenCalledWith(
      'http://10.0.2.2:38641',
      { allowWhileNotParticipating: true }
    );
  });
});

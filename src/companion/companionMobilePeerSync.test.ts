import { beforeEach, expect, it, vi } from 'vitest';

import type { RunCompanionStreamSyncArgs } from './companionWorkspaceSyncFlow';
import { createSyncState, resetCompanionWorkspaceSyncFlowMocks } from './companionWorkspaceSyncFlow.testHarness';

beforeEach(resetCompanionWorkspaceSyncFlowMocks);

it('runs a waiting desktop between background mobile slices and resumes the mobile backlog', async () => {
  const { scheduleCompanionMobilePeerSync } = await import('./companionMobilePeerSync');
  const { tryForegroundAutoSyncTarget } = await import('./companionSyncTargetFlow');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const order: string[] = [];
  const args = { cancelled: () => false, setError: vi.fn(), setState: vi.fn(),
    setSyncProgress: vi.fn(), setStatus: vi.fn(), state: createSyncState() };
  const mobile = { endpointUrl: 'http://mobile:38641', platform: 'android' };
  let slices = 0;
  const run = async (input: RunCompanionStreamSyncArgs) => {
    order.push(input.endpointUrl);
    if (input.endpointUrl === mobile.endpointUrl && ++slices === 1) {
      await gate;
      return 'backlog' as const;
    }
    return 'completed' as const;
  };
  scheduleCompanionMobilePeerSync('mobile-slice-test', args, run, [mobile]);
  await vi.waitFor(() => expect(order).toEqual([mobile.endpointUrl]));
  const desktop = tryForegroundAutoSyncTarget(args, { endpointUrl: 'http://desktop:38641' }, run);
  release();
  await desktop;
  await vi.waitFor(() => expect(order).toEqual([mobile.endpointUrl, 'http://desktop:38641', mobile.endpointUrl]));
});

import { describe, expect, it, vi } from 'vitest';

import {
  assertMacosAnchorReady,
  observeMacosAnchorAfterElection
} from './macos-a5-anchor-observation.mjs';

describe('Mac A5 anchor observation', () => {
  it('accepts only a running ready provider', () => {
    expect(assertMacosAnchorReady({ server_status: {
      state: 'running', topology_role: null, topology_status: 'ready'
    } })).toEqual({ role: null, status: 'ready' });
    expect(() => assertMacosAnchorReady({ server_status: {
      topology_role: 'observing', topology_status: 'observing'
    } })).toThrow('Mac Sync Group provider is not ready.');
  });

  it('waits for the product topology state instead of sleeping for an election guess', async () => {
    const session = { waitForState: vi.fn().mockResolvedValue({ server_status: {
      state: 'running', topology_role: null, topology_status: 'ready'
    } }) };

    await expect(observeMacosAnchorAfterElection(session, {
      timeoutMs: 12_000
    })).resolves.toEqual({ role: null, status: 'ready' });
    expect(session.waitForState).toHaveBeenCalledWith({
      command: 'load_sync_group_overview',
      condition: { kind: 'sync-group-topology', role: null, status: 'ready' },
      eventName: 'onSyncGroupOverviewChanged', timeoutMs: 12_000
    });
  });
});

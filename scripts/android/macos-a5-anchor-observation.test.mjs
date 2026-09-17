import { describe, expect, it, vi } from 'vitest';

import {
  assertMacosAnchorReady,
  observeMacosAnchorAfterElection
} from './macos-a5-anchor-observation.mjs';

describe('Mac A5 anchor observation', () => {
  it('accepts only a ready anchor projection', () => {
    expect(assertMacosAnchorReady({ server_status: {
      topology_role: 'anchor', topology_status: 'ready'
    } })).toEqual({ role: 'anchor', status: 'ready' });
    expect(() => assertMacosAnchorReady({ server_status: {
      topology_role: 'observing', topology_status: 'observing'
    } })).toThrow('Mac did not become the ready Sync Group anchor.');
  });

  it('waits for the product topology state instead of sleeping for an election guess', async () => {
    const session = { waitForState: vi.fn().mockResolvedValue({ server_status: {
      topology_role: 'anchor', topology_status: 'ready'
    } }) };

    await expect(observeMacosAnchorAfterElection(session, {
      timeoutMs: 12_000
    })).resolves.toEqual({ role: 'anchor', status: 'ready' });
    expect(session.waitForState).toHaveBeenCalledWith({
      command: 'load_sync_group_overview',
      condition: { kind: 'sync-group-topology', role: 'anchor', status: 'ready' },
      eventName: 'onSyncGroupOverviewChanged', timeoutMs: 12_000
    });
  });
});

import { describe, expect, it, vi } from 'vitest';

import {
  assertMacosProviderReady,
  observeMacosProviderReady
} from './macos-a5-provider-observation.mjs';

describe('Mac A5 provider observation', () => {
  it('accepts only a running ready provider', () => {
    expect(assertMacosProviderReady({ server_status: {
      state: 'running', topology_role: null, topology_status: 'ready'
    } })).toEqual({ role: null, status: 'ready' });
    expect(() => assertMacosProviderReady({ server_status: {
      topology_role: 'observing', topology_status: 'observing'
    } })).toThrow('Mac Sync Group provider is not ready.');
  });

  it('waits for the running provider state', async () => {
    const session = { waitForState: vi.fn().mockResolvedValue({ server_status: {
      state: 'running', topology_role: null, topology_status: 'ready'
    } }) };

    await expect(observeMacosProviderReady(session, {
      timeoutMs: 12_000
    })).resolves.toEqual({ role: null, status: 'ready' });
    expect(session.waitForState).toHaveBeenCalledWith({
      command: 'load_sync_group_overview',
      condition: { kind: 'sync-group-topology', role: null, status: 'ready' },
      eventName: 'onSyncGroupOverviewChanged', timeoutMs: 12_000
    });
  });
});

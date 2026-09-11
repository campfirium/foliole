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

  it('observes the role after the election window without requiring an anchor poll run', async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const session = { load: vi.fn().mockResolvedValue({ server_status: {
      topology_role: 'anchor', topology_status: 'ready'
    } }) };

    await expect(observeMacosAnchorAfterElection(session, {
      observationMs: 1_800, wait
    })).resolves.toEqual({ role: 'anchor', status: 'ready' });
    expect(wait).toHaveBeenCalledWith(1_800);
  });
});

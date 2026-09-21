import { afterEach, expect, it, vi } from 'vitest';

import {
  desktopAnchorAdvertisements,
  waitForCompanionDesktopAdvertisements
} from './companionDesktopDiscoveryWait';

function candidate(role = 'anchor', groupId = 'group-1') {
  return { endpoint_url: 'http://192.168.0.11:38641',
    protocol_txt: { group_id: groupId, provider_platform: 'win32', topology_role: role },
    source: 'nsd' as const };
}

afterEach(() => vi.useRealTimers());

it('keeps only desktop anchor advertisements', () => {
  expect(desktopAnchorAdvertisements({ candidates: [candidate(), candidate('member'), {
    ...candidate(), protocol_txt: { provider_platform: 'android-capacitor', topology_role: 'anchor' }
  }] })).toEqual([candidate()]);
});

it('waits for a late desktop anchor and releases the discovery session', async () => {
  let publish!: (event: Record<string, unknown>) => void;
  const remove = vi.fn(async () => undefined);
  const plugin = {
    addListener: vi.fn(async (_name, listener) => {
      publish = listener as typeof publish;
      return { remove };
    }),
    startDiscoverySession: vi.fn(async () => ({
      candidates: [], change: 'started', error_code: null, status: 'searching'
    })),
    stopDiscoverySession: vi.fn(async () => ({
      candidates: [], change: 'stopped', error_code: null, status: 'stopped'
    }))
  };

  const waiting = waitForCompanionDesktopAdvertisements(plugin as never);
  await vi.waitFor(() => expect(plugin.startDiscoverySession).toHaveBeenCalledOnce());
  publish({ candidates: [candidate()], change: 'found', error_code: null, status: 'results' });

  await expect(waiting).resolves.toEqual([candidate()]);
  expect(plugin.stopDiscoverySession).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
});

it('keeps observing when only another group has advertised an anchor', async () => {
  let publish!: (event: Record<string, unknown>) => void;
  const remove = vi.fn(async () => undefined);
  const plugin = {
    addListener: vi.fn(async (_name, listener) => {
      publish = listener as typeof publish;
      return { remove };
    }),
    startDiscoverySession: vi.fn(async () => ({
      candidates: [candidate('anchor', 'old-group')],
      change: 'started', error_code: null, status: 'results'
    })),
    stopDiscoverySession: vi.fn(async () => ({
      candidates: [], change: 'stopped', error_code: null, status: 'stopped'
    }))
  };

  const waiting = waitForCompanionDesktopAdvertisements(plugin as never, 1_000, 'group-1');
  await vi.waitFor(() => expect(plugin.startDiscoverySession).toHaveBeenCalledOnce());
  expect(plugin.stopDiscoverySession).not.toHaveBeenCalled();
  publish({ candidates: [candidate('anchor', 'old-group'), candidate()],
    change: 'found', error_code: null, status: 'results' });

  await expect(waiting).resolves.toEqual([candidate()]);
  expect(plugin.stopDiscoverySession).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
});

it('returns no anchor and cleans up when the observation expires', async () => {
  vi.useFakeTimers();
  const remove = vi.fn(async () => undefined);
  const plugin = {
    addListener: vi.fn(async () => ({ remove })),
    startDiscoverySession: vi.fn(async () => ({
      candidates: [], change: 'started', error_code: null, status: 'searching'
    })),
    stopDiscoverySession: vi.fn(async () => ({
      candidates: [], change: 'stopped', error_code: null, status: 'stopped'
    }))
  };

  const waiting = waitForCompanionDesktopAdvertisements(plugin as never, 1_000);
  await vi.advanceTimersByTimeAsync(1_000);

  await expect(waiting).resolves.toEqual([]);
  expect(plugin.stopDiscoverySession).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledOnce();
});

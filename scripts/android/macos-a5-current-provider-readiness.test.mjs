import { expect, it, vi } from 'vitest';

import { waitForCurrentA5Provider } from './macos-a5-current-provider-readiness.mjs';

it('waits for the exact current Sync Group Device provider', async () => {
  let collect;
  const stop = vi.fn();
  const destroy = vi.fn();
  const fetchProvider = vi.fn(async () => ({
    json: async () => ({ group_id: 'group-a', provider_device_id: 'device-a5' }), ok: true
  }));
  const waiting = waitForCurrentA5Provider({ deviceId: 'device-a5', groupId: 'group-a' }, {
    createBonjour: () => ({ destroy, find: (_query, callback) => {
      collect = callback;
      return { stop };
    } }),
    fetchProvider,
    timeoutMs: 1_000
  });
  await collect({ addresses: ['192.168.0.7'], port: 38641,
    txt: { device_id: 'old-device', group_id: 'group-a' } });
  expect(fetchProvider).not.toHaveBeenCalled();
  await collect({ addresses: ['192.168.0.8'], port: 38641,
    txt: { device_id: 'device-a5', group_id: 'group-a' } });

  await expect(waiting).resolves.toEqual({
    deviceId: 'device-a5', endpointUrl: 'http://192.168.0.8:38641', groupId: 'group-a'
  });
  expect(stop).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
});

it('rejects a discovery payload that belongs to another Device', async () => {
  let collect;
  const waiting = waitForCurrentA5Provider({ deviceId: 'device-a5', groupId: 'group-a' }, {
    createBonjour: () => ({ destroy: vi.fn(), find: (_query, callback) => {
      collect = callback;
      return { stop: vi.fn() };
    } }),
    fetchProvider: async () => ({
      json: async () => ({ group_id: 'group-a', provider_device_id: 'old-device' }), ok: true
    }),
    timeoutMs: 20
  });
  await collect({ addresses: ['192.168.0.8'], port: 38641,
    txt: { device_id: 'device-a5', group_id: 'group-a' } });

  await expect(waiting).rejects.toThrow('Current A5 Device provider was not published');
});

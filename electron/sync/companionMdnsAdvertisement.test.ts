import { beforeEach, describe, expect, it, vi } from 'vitest';

import { serializeSyncProtocolTxt } from '../../lib/platform/syncProtocolContract.js';

const runtime = vi.hoisted(() => ({
  callbacks: [] as Array<(event: Record<string, unknown>) => void>,
  cancel: vi.fn(),
  networkInterfaces: vi.fn(),
  register: vi.fn()
}));

vi.mock('node:os', () => ({
  default: { networkInterfaces: runtime.networkInterfaces }
}));
vi.mock('@foliole/desktop-dnssd', () => ({
  register: (input: unknown, callback: (event: Record<string, unknown>) => void) => {
    runtime.register(input);
    runtime.callbacks.push(callback);
    return { cancel: runtime.cancel, stop: runtime.cancel };
  }
}));
vi.mock('./syncGroupRuntimeInstance.js', () => ({
  loadSyncGroupRuntimeInstanceId: () => 'runtime-desktop-v'
}));

import {
  refreshCompanionMdnsAdvertisement,
  startCompanionMdnsAdvertisement,
  stopCompanionMdnsAdvertisement
} from './companionMdnsAdvertisement.js';

const input = {
  appVersion: '0.1.0-test', deviceId: 'desktop-local', groupDisplayName: 'V',
  groupId: 'group-1', groupTag: 'tag-1', port: 38683
};

beforeEach(() => {
  stopCompanionMdnsAdvertisement();
  vi.clearAllMocks();
  runtime.callbacks = [];
  runtime.networkInterfaces.mockReturnValue({
    ethernet: [{ address: '192.168.0.11', family: 'IPv4', internal: false }]
  });
});

describe('desktop OS DNS-SD advertisement', () => {
  it('registers one system service with the existing service and TXT contract', async () => {
    const ready = startCompanionMdnsAdvertisement(input);
    runtime.callbacks[0]?.({ kind: 'registered', service: {} });
    await ready;

    expect(runtime.register).toHaveBeenCalledOnce();
    expect(runtime.register).toHaveBeenCalledWith({
      domain: 'local.', name: expect.stringMatching(/^V-runtimed-r[0-9a-z]+$/u),
      port: 38683, type: '_foliole-sync._tcp',
      txt: { app_version: '0.1.0-test', device_id: 'desktop-local',
        facts_revision: expect.any(String), group_id: 'group-1', group_tag: 'tag-1',
        ipv4_addresses: '192.168.0.11', runtime_instance_id: 'runtime-desktop-v',
        ...serializeSyncProtocolTxt() }
    });
  });

  it('fails closed and withdraws registration when the host reports an error', async () => {
    const onWarning = vi.fn();
    const ready = startCompanionMdnsAdvertisement({ ...input, onWarning });
    runtime.callbacks[0]?.({ code: 'desktop_dnssd_register_failed', kind: 'error',
      message: 'host unavailable' });

    await expect(ready).rejects.toThrow('desktop_dnssd_register_failed');
    expect(onWarning).toHaveBeenCalledOnce();
    expect(runtime.cancel).toHaveBeenCalledOnce();
  });

  it('withdraws the old registration before publishing refreshed facts', async () => {
    const ready = startCompanionMdnsAdvertisement(input);
    runtime.callbacks[0]?.({ kind: 'registered', service: {} });
    await ready;
    const refreshed = refreshCompanionMdnsAdvertisement();
    await vi.waitFor(() => expect(runtime.register).toHaveBeenCalledTimes(2));
    runtime.callbacks[1]?.({ kind: 'registered', service: {} });
    await refreshed;

    const names = runtime.register.mock.calls.map(([entry]) => (entry as { name: string }).name);
    expect(names[1]).not.toBe(names[0]);
    expect(runtime.cancel).toHaveBeenCalledOnce();
  });

  it('waits for startup registration before superseding it with refreshed facts', async () => {
    const ready = startCompanionMdnsAdvertisement(input);
    const refreshed = refreshCompanionMdnsAdvertisement();

    await Promise.resolve();
    expect(runtime.register).toHaveBeenCalledOnce();
    expect(runtime.cancel).not.toHaveBeenCalled();
    runtime.callbacks[0]?.({ kind: 'registered', service: {} });
    await ready;
    await vi.waitFor(() => expect(runtime.register).toHaveBeenCalledTimes(2));
    runtime.callbacks[1]?.({ kind: 'registered', service: {} });
    await refreshed;

    expect(runtime.cancel).toHaveBeenCalledOnce();
  });

  it('cancels exactly the active system registration when stopped', async () => {
    const ready = startCompanionMdnsAdvertisement(input);
    runtime.callbacks[0]?.({ kind: 'registered', service: {} });
    await ready;
    stopCompanionMdnsAdvertisement();
    stopCompanionMdnsAdvertisement();

    expect(runtime.cancel).toHaveBeenCalledOnce();
  });
});
